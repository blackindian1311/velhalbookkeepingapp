import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from './firebase';
import {
  collection, addDoc, updateDoc, doc, setDoc, onSnapshot,
  deleteDoc, query, where, getDocs
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helpers
const asNumber = v => Number(typeof v === 'string' ? v.replace(/,/g, '') : v) || 0;
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const d = new Date(dateString);
  if (isNaN(d)) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

// Show base amount (before GST) only in the Amount cell for purchases.
// No layout change. Payments/returns unchanged.
const getDisplayAmount = (tx) => {
  if (tx.type === 'purchase') {
    if (tx.baseAmount !== undefined && tx.baseAmount !== null) {
      return asNumber(tx.baseAmount);
    }
    if (tx.hasGST !== false) {
      return asNumber(tx.amount) / 1.05;
    }
    return asNumber(tx.amount);
  }
  return asNumber(tx.amount);
};

// Filter transactions by date range
const filterTransactionsByDate = (transactions, startDate, endDate) => {
  if (!startDate || !endDate) return transactions;
  const start = new Date(startDate);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate >= start && txDate <= end;
  });
};

// Calculate remaining salary for current month
const calculateRemainingSalary = (employee, salaryTransactions) => {
  if (!employee.salaryPeriodStart || !employee.salaryPeriodEnd || !employee.basicSalary) {
    return employee.basicSalary || 0;
  }
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const periodStart = new Date(currentYear, currentMonth, employee.salaryPeriodStart);
  const periodEnd = new Date(currentYear, currentMonth, employee.salaryPeriodEnd);
  if (periodEnd < periodStart) {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  const paidInPeriod = salaryTransactions
    .filter(tx =>
      tx.employeeName === employee.name &&
      new Date(tx.date) >= periodStart &&
      new Date(tx.date) <= periodEnd
    )
    .reduce((total, tx) => total + asNumber(tx.amount), 0);
  return Math.max(0, asNumber(employee.basicSalary) - paidInPeriod);
};

const PartyInfoTable = ({ parties = [], onEditParty }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 7;
  const filtered = parties.filter(p =>
    (p.businessName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.contactName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.phoneNumber || '').includes(search) ||
    (p.contactMobile || '').includes(search)
  );
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const shown = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <div>
      <input
        type='text'
        value={search}
        placeholder='Search party...'
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ marginBottom: '10px', padding: '5px', width: '100%' }}
      />
      <div style={{ overflowX: 'auto' }}>
        <table className='transaction-table'>
          <thead>
            <tr>
              <th>Business</th>
              <th>Phone</th>
              <th>Bank</th>
              <th>Bank Name</th>
              <th>Contact</th>
              <th>Mobile</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#888' }}>No parties found.</td></tr>
            )}
            {shown.map((p, i) => (
              <tr key={i}>
                <td>{p.businessName}</td>
                <td>{p.phoneNumber}</td>
                <td>{p.bankNumber}</td>
                <td>{p.bankName}</td>
                <td>{p.contactName}</td>
                <td>{p.contactMobile}</td>
                <td>
                  <button 
                    onClick={() => onEditParty && onEditParty(p)}
                    style={{ padding: '4px 8px', fontSize: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '3px' }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        Page {page}/{totalPages || 1}
        <br />
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={{ marginLeft: 8 }}>Next</button>
      </div>
    </div>
  );
};

// Employee Management Components
const EmployeeTable = ({ employees, onEditEmployee, onSetupSalary, onViewEmployee }) => {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className='transaction-table'>
        <thead>
          <tr>
            <th style={{ padding: '8px' }}>Employee Name</th>
            <th style={{ padding: '8px' }}>Basic Salary</th>
            <th style={{ padding: '8px' }}>Salary Period</th>
            <th style={{ padding: '8px' }}>Last Updated</th>
            <th style={{ padding: '8px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.length === 0 && (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No employees found.</td></tr>
          )}
          {employees.map((emp, i) => (
            <tr key={emp.id || i}>
              <td style={{ padding: '8px', fontSize: '14px', fontWeight: 'bold' }}>{emp.name}</td>
              <td style={{ padding: '8px' }}>
                {emp.basicSalary ? `₹${asNumber(emp.basicSalary).toFixed(2)}` : 'Not Set'}
              </td>
              <td style={{ padding: '8px' }}>
                {emp.salaryPeriodStart && emp.salaryPeriodEnd 
                  ? `${emp.salaryPeriodStart} to ${emp.salaryPeriodEnd} of month`
                  : 'Not Set'
                }
              </td>
              <td style={{ padding: '8px' }}>
                {emp.salaryLastUpdated ? formatDate(emp.salaryLastUpdated) : '-'}
              </td>
              <td style={{ padding: '8px' }}>
                <button 
                  onClick={() => onViewEmployee(emp)}
                  style={{ padding: '4px 8px', fontSize: '12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '3px', marginRight: '5px' }}
                >
                  View
                </button>
                <button 
                  onClick={() => onEditEmployee(emp)}
                  style={{ padding: '4px 8px', fontSize: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '3px', marginRight: '5px' }}
                >
                  Edit
                </button>
                <button 
                  onClick={() => onSetupSalary(emp)}
                  style={{ padding: '4px 8px', fontSize: '12px', background: '#ffc107', color: 'black', border: 'none', borderRadius: '3px' }}
                >
                  Salary Setup
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function CommentModal({ tx, onClose }) {
  if (!tx) return null;
  return (
    <div className='modal'>
      <div style={{ maxWidth: 400, minWidth: 300, margin: 'auto', border: '1px solid #bbb', borderRadius: 6, background: '#fff', padding: 20 }}>
        <h3>Transaction Details</h3>
        <div style={{ marginBottom: 12 }}>
          <div><strong>Type:</strong> {tx.type}</div>
          <div><strong>Date:</strong> {formatDate(tx.date)}</div>
          <div><strong>Party:</strong> {tx.party}</div>
          <div><strong>Amount:</strong> ₹{asNumber(tx.amount).toFixed(2)}</div>
          {tx.billNumber && <div><strong>Bill No:</strong> {tx.billNumber}</div>}
          {tx.method && <div><strong>Method:</strong> {tx.method}</div>}
          {tx.checkNumber && <div><strong>Check No:</strong> {tx.checkNumber}</div>}
          {tx.employeeName && <div><strong>Employee:</strong> {tx.employeeName}</div>}
          <div><strong>GST Applied:</strong> {tx.hasGST !== false ? 'Yes' : 'No'}</div>
        </div>
        <div>
          <strong>Comment:</strong>
          <div style={{ marginTop: 3, fontStyle: 'italic', color: '#222' }}>
            {tx.comment || <span style={{ color: '#999' }}>No comment provided.</span>}
          </div>
        </div>
        <button onClick={onClose} style={{ marginTop: 15 }}>Close</button>
      </div>
    </div>
  );
}

function EditPartyModal({ party, onClose, onSave }) {
  const [editPartyForm, setEditPartyForm] = useState({
    businessName: party?.businessName || '',
    phoneNumber: party?.phoneNumber || '',
    bankNumber: party?.bankNumber || '',
    bankName: party?.bankName || '',
    contactName: party?.contactName || '',
    contactMobile: party?.contactMobile || ''
  });

  const handleSave = async () => {
    if (!editPartyForm.businessName || !editPartyForm.phoneNumber || !editPartyForm.bankNumber || 
        !editPartyForm.contactName || !editPartyForm.contactMobile || !editPartyForm.bankName) {
      alert('Please fill all fields.');
      return;
    }
    await onSave(party.id, editPartyForm);
    onClose();
  };

  if (!party) return null;

  return (
    <div className='modal'>
      <div style={{ maxWidth: 500, minWidth: 400, margin: 'auto', border: '1px solid #bbb', borderRadius: 6, background: '#fff', padding: 20 }}>
        <h3>Edit Party Details</h3>
        <div style={{ marginBottom: 15 }}>
          <label>Business Name:</label>
          <input 
            type='text' 
            value={editPartyForm.businessName} 
            onChange={e => setEditPartyForm({...editPartyForm, businessName: e.target.value})}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>Phone:</label>
          <input 
            type='text' 
            value={editPartyForm.phoneNumber} 
            onChange={e => setEditPartyForm({...editPartyForm, phoneNumber: e.target.value})}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>Bank Number:</label>
          <input 
            type='text' 
            value={editPartyForm.bankNumber} 
            onChange={e => setEditPartyForm({...editPartyForm, bankNumber: e.target.value})}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>Bank Name:</label>
          <input 
            type='text' 
            value={editPartyForm.bankName} 
            onChange={e => setEditPartyForm({...editPartyForm, bankName: e.target.value})}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>Contact Name:</label>
          <input 
            type='text' 
            value={editPartyForm.contactName} 
            onChange={e => setEditPartyForm({...editPartyForm, contactName: e.target.value})}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: 15 }}>
          <label>Contact Mobile:</label>
          <input 
            type='text' 
            value={editPartyForm.contactMobile} 
            onChange={e => setEditPartyForm({...editPartyForm, contactMobile: e.target.value})}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginTop: 20 }}>
          <button onClick={handleSave} style={{ marginRight: 10, padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Save</button>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const HomePage = () => {
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [commentTxModal, setCommentTxModal] = useState(null);
  const [editingParty, setEditingParty] = useState(null);
  const [view, setView] = useState('home');

  // Employee Management States
  const [employees, setEmployees] = useState([]);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [settingSalaryFor, setSettingSalaryFor] = useState(null);
  const [viewingEmployee, setViewingEmployee] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    basicSalary: '',
    salaryPeriodStart: '',
    salaryPeriodEnd: ''
  });
  const [selectedEmployee, setSelectedEmployee] = useState('');

  const [bankBalance, setBankBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDate, setDepositDate] = useState('');

  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [returnTransactions, setReturnTransactions] = useState([]);
  const [salaryTransactions, setSalaryTransactions] = useState([]);
  const [bankDeposits, setBankDeposits] = useState([]);
  const [partiesInfo, setPartiesInfo] = useState([]);

  const [partyInput, setPartyInput] = useState({
    businessName: '', phoneNumber: '', bankNumber: '',
    contactName: '', contactMobile: '', bankName: ''
  });

  const [selectedParty, setSelectedParty] = useState('');
  const [form, setForm] = useState({
    amount: '',
    billNumber: '',
    date: '',
    payment: '',
    paymentMethod: '',
    returnAmount: '',
    returnDate: '',
    checkNumber: '',
    salaryDate: '',
    employeeName: '',
    salaryAmount: '',
    comment: '',
    hasGST: true
  });
  const [showPartyForm, setShowPartyForm] = useState(false);

  // Date filters for each view
  const [homeFilterStart, setHomeFilterStart] = useState('');
  const [homeFilterEnd, setHomeFilterEnd] = useState('');
  const [purchaseFilterStart, setPurchaseFilterStart] = useState('');
  const [purchaseFilterEnd, setPurchaseFilterEnd] = useState('');
  const [paymentFilterStart, setPaymentFilterStart] = useState('');
  const [paymentFilterEnd, setPaymentFilterEnd] = useState('');
  const [returnFilterStart, setReturnFilterStart] = useState('');
  const [returnFilterEnd, setReturnFilterEnd] = useState('');
  const [balanceFilterStart, setBalanceFilterStart] = useState('');
  const [balanceFilterEnd, setBalanceFilterEnd] = useState('');
  const [bankFilterStart, setBankFilterStart] = useState('');
  const [bankFilterEnd, setBankFilterEnd] = useState('');
  const [salaryFilterStart, setSalaryFilterStart] = useState('');
  const [salaryFilterEnd, setSalaryFilterEnd] = useState('');

  // Export date range (for home page)
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  useEffect(() => {
    const unsubParties = onSnapshot(collection(db, 'parties'), snap =>
      setPartiesInfo(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const unsubPurch = onSnapshot(collection(db, 'purchases'), snap =>
      setPurchaseTransactions(snap.docs.map(d => ({ id: d.id, type: 'purchase', ...d.data() })));
    const unsubPay = onSnapshot(collection(db, 'payments'), snap =>
      setPaymentTransactions(snap.docs.map(d => ({ id: d.id, type: 'payment', ...d.data() })));
    const unsubRet = onSnapshot(collection(db, 'returns'), snap =>
      setReturnTransactions(snap.docs.map(d => ({ id: d.id, type: 'return', ...d.data() })));
    const unsubSalary = onSnapshot(collection(db, 'salaries'), snap =>
      setSalaryTransactions(snap.docs.map(d => ({ id: d.id, type: 'salary', ...d.data() })));
    const unsubEmployees = onSnapshot(collection(db, 'employees'), snap =>
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const unsubDepos = onSnapshot(collection(db, 'bankDeposits'), snap =>
      setBankDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    const unsubBank = onSnapshot(doc(db, 'meta', 'bank'), ds =>
      setBankBalance(ds.exists() ? (ds.data().balance || 0) : 0);
    return () => {
      unsubParties(); unsubPurch(); unsubPay(); unsubRet(); unsubSalary(); unsubEmployees(); unsubDepos(); unsubBank();
    };
  }, []);

  // REMOVED salary from allTransactions - keep salary separate
  const allTransactions = [...purchaseTransactions, ...paymentTransactions, ...returnTransactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredTransactions = selectedParty
    ? allTransactions.filter(tx => tx.party === selectedParty)
    : allTransactions;

  const totalOwed = filteredTransactions.reduce((t, tx) => {
    if (tx.type === 'purchase') return t + asNumber(tx.amount);
    if (tx.type === 'payment' || tx.type === 'return') return t - asNumber(tx.amount);
    return t;
  }, 0);

  // REMOVED salary from bank ledger - keep bank separate from salary
  const getBankLedger = () => {
    let ledger = [];
    bankDeposits.forEach(d => {
      if (d.isPaymentDeduction !== true) {
        ledger.push({
          id: d.id,
          date: d.date,
          party: d.party || '-',
          method: 'Deposit',
          checkNumber: '-',
          debit: d.amount < 0 ? Math.abs(asNumber(d.amount)) : null,
          credit: d.amount > 0 ? asNumber(d.amount) : null,
          type: 'deposit',
          source: 'bankDeposits',
          isPaymentDeduction: false
        });
      }
    });
    paymentTransactions.forEach(p => {
      if (p.method === 'NEFT' || p.method === 'Check') {
        ledger.push({
          id: p.id,
          date: p.date,
          party: p.party,
          method: p.method,
          checkNumber: p.checkNumber || '-',
          debit: asNumber(p.amount),
          credit: null,
          type: 'payment',
          source: 'payments',
          isPaymentDeduction: true
        });
      }
    });
    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));
    let asc = ledger.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = 0;
    const withBal = asc.map(e => {
      if (e.credit) bal += e.credit;
      if (e.debit) bal -= e.debit;
      return { ...e, balance: bal };
    });
    return withBal.reverse();
  };

  const clearFormFields = () => setForm({
    amount: '', billNumber: '', date: '', payment: '',
    paymentMethod: '', returnAmount: '', returnDate: '',
    checkNumber: '', salaryDate: '', employeeName: '', 
    salaryAmount: '', comment: '', hasGST: true
  });

  const clearEmployeeForm = () => setEmployeeForm({
    name
