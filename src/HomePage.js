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
      setPartiesInfo(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubPurch = onSnapshot(collection(db, 'purchases'), snap =>
      setPurchaseTransactions(snap.docs.map(d => ({ id: d.id, type: 'purchase', ...d.data() })))
    );
    const unsubPay = onSnapshot(collection(db, 'payments'), snap =>
      setPaymentTransactions(snap.docs.map(d => ({ id: d.id, type: 'payment', ...d.data() })))
    );
    const unsubRet = onSnapshot(collection(db, 'returns'), snap =>
      setReturnTransactions(snap.docs.map(d => ({ id: d.id, type: 'return', ...d.data() })))
    );
    const unsubSalary = onSnapshot(collection(db, 'salaries'), snap =>
      setSalaryTransactions(snap.docs.map(d => ({ id: d.id, type: 'salary', ...d.data() })))
    );
    const unsubEmployees = onSnapshot(collection(db, 'employees'), snap =>
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubDepos = onSnapshot(collection(db, 'bankDeposits'), snap =>
      setBankDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubBank = onSnapshot(doc(db, 'meta', 'bank'), ds =>
      setBankBalance(ds.exists() ? (ds.data().balance || 0) : 0)
    );
    return () => {
      unsubParties(); unsubPurch(); unsubPay(); unsubRet(); unsubSalary(); unsubEmployees(); unsubDepos(); unsubBank();
    };
  }, []);

  // Keep salary separate
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
    name: '', basicSalary: '', salaryPeriodStart: '', salaryPeriodEnd: ''
  });

  // Employee Management Functions (unchanged)
  const handleAddEmployee = async () => { /* ... unchanged ... */ };
  const handleEditEmployee = (employee) => { /* ... unchanged ... */ };
  const handleUpdateEmployee = async () => { /* ... unchanged ... */ };
  const handleSetupSalary = (employee) => { /* ... unchanged ... */ };
  const handleSaveSalarySetup = async () => { /* ... unchanged ... */ };
  const handleViewEmployee = (employee) => { /* ... unchanged ... */ };

  const handleDeleteTransaction = async (tx) => { /* ... unchanged ... */ };
  const handleDeleteBankEntry = async (entry) => { /* ... unchanged ... */ };

  const handleEditParty = (party) => { /* ... unchanged ... */ };
  const handleSaveParty = async (partyId, partyData) => { /* ... unchanged ... */ };
  const handleAddParty = async () => { /* ... unchanged ... */ };

  const handleAddPurchase = async () => { /* ... unchanged ... */ };
  const handleAddPayment = async () => { /* ... unchanged ... */ };
  const handleAddReturn = async () => { /* ... unchanged ... */ };
  const handleAddSalary = async () => { /* ... unchanged ... */ };
  const handleDeposit = async () => { /* ... unchanged ... */ };

  const handleEditClick = (tx) => { /* ... unchanged ... */ };
  const handleEditSave = async () => { /* ... unchanged ... */ };
  const handleEditCancel = () => { /* ... unchanged ... */ };

  const TransactionTable = ({ transactions, onEdit, onSeeComment, onDelete }) => {
    const txs = transactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const runningBalances = {};
    const sortedByParty = {};
    transactions.forEach(tx => {
      if (!sortedByParty[tx.party]) sortedByParty[tx.party] = [];
      sortedByParty[tx.party].push(tx);
    });
    Object.keys(sortedByParty).forEach(party => {
      sortedByParty[party].sort((a, b) => new Date(a.date) - new Date(b.date));
      let bal = 0;
      sortedByParty[party].forEach(tx => {
        if (tx.type === 'purchase') bal += asNumber(tx.amount);
        if (tx.type === 'payment' || tx.type === 'return') bal -= asNumber(tx.amount);
        runningBalances[tx.id] = bal;
      });
    });

    return (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className='transaction-table' style={{ 
          width: '100%', 
          minWidth: '1200px',
          fontSize: '13px',
          borderCollapse: 'collapse'
        }}>
          <thead>
            <tr>
              <th style={{ minWidth: '85px', padding: '8px 4px' }}>Date</th>
              <th style={{ minWidth: '120px', padding: '8px 4px' }}>Party</th>
              <th style={{ minWidth: '70px', padding: '8px 4px' }}>Type</th>
              <th style={{ minWidth: '70px', padding: '8px 4px' }}>Bill No</th>
              <th style={{ minWidth: '70px', padding: '8px 4px' }}>Method</th>
              <th style={{ minWidth: '70px', padding: '8px 4px' }}>Check No</th>
              <th style={{ minWidth: '85px', padding: '8px 4px' }}>Amount</th>
              <th style={{ minWidth: '70px', padding: '8px 4px' }}>GST</th>
              <th style={{ minWidth: '80px', padding: '8px 4px' }}>Debit</th>
              <th style={{ minWidth: '80px', padding: '8px 4px' }}>Credit</th>
              <th style={{ minWidth: '85px', padding: '8px 4px' }}>Balance</th>
              <th style={{ minWidth: '50px', padding: '8px 4px' }}>Edit</th>
              <th style={{ minWidth: '80px', padding: '8px 4px' }}>Comment</th>
              <th style={{ minWidth: '60px', padding: '8px 4px' }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx, i) => {
              const debit = tx.type === 'purchase' ? asNumber(tx.amount) : null;
              const credit = (tx.type === 'payment' || tx.type === 'return') ? asNumber(tx.amount) : null;
              const gst = tx.type === 'purchase'
                ? (tx.hasGST !== false 
                   ? '₹' + (Number(tx.gstAmount) !== undefined && tx.gstAmount !== null
                     ? Number(tx.gstAmount).toFixed(2)
                     : ((asNumber(tx.amount) / 1.05) * 0.05).toFixed(2))
                   : '₹0.00')
                : '-';

              // Amount display: base (pre-GST) for purchase; amount for payment/return
              const amountDisplay = (() => {
                if (tx.type === 'purchase') {
                  const base =
                    tx.baseAmount !== undefined && tx.baseAmount !== null
                      ? asNumber(tx.baseAmount)
                      : (tx.hasGST !== false
                          ? asNumber(tx.amount) / 1.05
                          : asNumber(tx.amount));
                  return `₹${base.toFixed(2)}`;
                }
                return `₹${asNumber(tx.amount).toFixed(2)}`;
              })();

              return (
                <tr key={tx.id || i}>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{formatDate(tx.date)}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tx.party}
                  </td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{tx.type}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{tx.billNumber || '-'}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{tx.method || '-'}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{tx.method === 'Check' && tx.checkNumber ? tx.checkNumber : '-'}</td>

                  {/* Amount before GST for purchases */}
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{amountDisplay}</td>

                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{gst}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>
                    {debit !== null ? `₹${asNumber(debit).toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>
                    {credit !== null ? `₹${asNumber(credit).toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>₹{runningBalances[tx.id] !== undefined ? asNumber(runningBalances[tx.id]).toFixed(2) : '-'}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <button 
                      onClick={() => onEdit && onEdit(tx)}
                      style={{ padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px', background: '#f8f9fa' }}
                    >
                      Edit
                    </button>
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    {tx.comment ? 
                      <button 
                        onClick={() => onSeeComment && onSeeComment(tx)}
                        style={{ padding: '4px 6px', fontSize: '11px', border: '1px solid #ccc', borderRadius: '3px', background: '#e7f3ff' }}
                      >
                        Comment
                      </button> 
                      : ''
                    }
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <button 
                      onClick={() => onDelete && onDelete(tx)} 
                      style={{ padding: '4px 6px', fontSize: '11px', color: 'white', background: '#dc3545', border: 'none', borderRadius: '3px' }}
                    >
                      Del
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Salary table unchanged
  const SalaryTable = ({ salaries }) => {
    const sorted = salaries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    return (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className='transaction-table' style={{ width: '100%', minWidth: '400px', fontSize: '13px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ minWidth: '85px', padding: '8px 4px' }}>Date</th>
              <th style={{ minWidth: '200px', padding: '8px 4px' }}>Employee Name</th>
              <th style={{ minWidth: '100px', padding: '8px 4px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No salary records found.</td></tr>
            )}
            {sorted.map((salary, i) => (
              <tr key={salary.id || i}>
                <td style={{ padding: '6px 4px', fontSize: '12px' }}>{formatDate(salary.date)}</td>
                <td style={{ padding: '6px 4px', fontSize: '12px' }}>{salary.employeeName}</td>
                <td style={{ padding: '6px 4px', fontSize: '12px' }}>₹{asNumber(salary.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const downloadCSV = (filename, rows) => {
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export functions (unchanged in amount semantics)
  const exportPurchaseHistory = (format) => { /* ... unchanged ... */ };
  const exportPaymentHistory = (format) => { /* ... unchanged ... */ };
  const exportReturnHistory = (format) => { /* ... unchanged ... */ };
  const exportBankLedger = (format) => { /* ... unchanged ... */ };
  const exportAllTransactions = (format) => { /* ... unchanged ... */ };
  const exportSalaries = (format) => { /* ... unchanged ... */ };

  return (
    <div className="home-page">
      <div className="sidebar">
        <h1 className="nrv-logo">NRV</h1>
        {['home', 'purchase', 'pay', 'return', 'balance', 'party', 'bank', 'salary'].map(btn => (
          <button key={btn} style={{ marginBottom: '15px' }} onClick={() => setView(btn)}>
            {btn.charAt(0).toUpperCase() + btn.slice(1)}
          </button>
        ))}
      </div>

      <div className="content">     
        {view === 'home' && (
          <>
            <h1>NANDKUMAR RAMACHANDRA VELHAL</h1>
            <h3>Total Owed to All Parties: ₹{(totalOwed || 0).toFixed(2)}</h3>
            <div style={{ margin: '10px 0' }}>
              <button onClick={() => exportAllTransactions('csv')}>Export CSV</button>
              <button onClick={() => exportAllTransactions('pdf')} style={{ marginLeft: 8 }}>Export PDF</button>
            </div>
            <h4>All Transactions</h4>
            <TransactionTable
              transactions={allTransactions}
              onEdit={setEditingTransaction}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
            {commentTxModal && <CommentModal tx={commentTxModal} onClose={()=>setCommentTxModal(null)} />}
          </>
        )}

        {view === 'purchase' && (
          <div className='form-container'>
            <h2>Purchase Entry</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="text" placeholder="Bill No" value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} />
            <input type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            <div style={{ marginTop: 6 }}>
              <label style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={form.hasGST}
                  onChange={e => setForm({ ...form, hasGST: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                Apply 5% GST
              </label>
            </div>
            <button className='addPurchase-button' onClick={handleAddPurchase}>Add Purchase</button>
            <div style={{ margin: '10px 0' }}>
              <button onClick={() => exportPurchaseHistory('csv')}>Export CSV</button>
              <button onClick={() => exportPurchaseHistory('pdf')} style={{ marginLeft: 8 }}>Export PDF</button>
            </div>
            {form.amount && !isNaN(parseFloat(form.amount)) && (
              <div style={{ marginTop: '10px' }}>
                <p>GST (5%): ₹{(parseFloat(form.amount || 0) * 0.05).toFixed(2)}</p>
                <p>Total after GST: ₹{Math.round(parseFloat(form.amount || 0) * (form.hasGST ? 1.05 : 1)).toFixed(0)}</p>
              </div>
            )}

            <h3 style={{ marginTop: 20 }}>Recent Purchases</h3>
            <TransactionTable
              transactions={purchaseTransactions}
              onEdit={setEditingTransaction}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
            {commentTxModal && <CommentModal tx={commentTxModal} onClose={()=>setCommentTxModal(null)} />}
          </div>
        )}

        {view === 'pay' && (
          <div className='form-container'>
            <h2>Payment</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => (
                <option key={i} value={p.businessName}>{p.businessName}</option>
              ))}
            </select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="number" placeholder="Amount" value={form.payment} onChange={e => setForm({ ...form, payment: e.target.value })} />
            <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value="">Select Payment Method</option>
              <option value="Cash">Cash</option>
              <option value="NEFT">NEFT</option>
              <option value="Check">Check</option>
            </select>
            {form.paymentMethod === 'Check' && (
              <input type="text" placeholder="Enter Check Number" value={form.checkNumber || ''} onChange={e => setForm({ ...form, checkNumber: e.target.value })} />
            )}
            <button className='addPurchase-button' onClick={handleAddPayment}>Add Payment</button>
            <div style={{ margin: '10px 0' }}>
              <button onClick={() => exportPaymentHistory('csv')}>Export CSV</button>
              <button onClick={() => exportPaymentHistory('pdf')} style={{ marginLeft: 8 }}>Export PDF</button>
            </div>

            <h3 style={{ marginTop: 20 }}>Recent Payments</h3>
            <TransactionTable
              transactions={paymentTransactions}
              onEdit={setEditingTransaction}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
            {commentTxModal && <CommentModal tx={commentTxModal} onClose={()=>setCommentTxModal(null)} />}
          </div>
        )}

        {view === 'return' && (
          <div className='form-container'>
            <h2>Return</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type="number" placeholder="Return Amount" value={form.returnAmount} onChange={e => setForm({ ...form, returnAmount: e.target.value })} />
            <input type="text" placeholder="Bill No" value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} />
            <input type="date" value={form.returnDate} onChange={e => setForm({ ...form, returnDate: e.target.value })} />
            <input type="text" placeholder="Comment (required)" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} />
            <button className='addPurchase-button' onClick={handleAddReturn}>Add Return</button>
            <div style={{ margin: '10px 0' }}>
              <button onClick={() => exportReturnHistory('csv')}>Export CSV</button>
              <button onClick={() => exportReturnHistory('pdf')} style={{ marginLeft: 8 }}>Export PDF</button>
            </div>

            <h3 style={{ marginTop: 20 }}>Recent Returns</h3>
            <TransactionTable
              transactions={returnTransactions}
              onEdit={setEditingTransaction}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
            {commentTxModal && <CommentModal tx={commentTxModal} onClose={()=>setCommentTxModal(null)} />}
          </div>
        )}

        {view === 'balance' && (
          <div className='form-container'>
            <h2>Balance for: {selectedParty || 'None selected'}</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <p>Total Owed: ₹{(totalOwed || 0).toFixed(2)}</p>

            <TransactionTable
              transactions={selectedParty ? allTransactions.filter(tx => tx.party === selectedParty) : []}
              onEdit={setEditingTransaction}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
            {commentTxModal && <CommentModal tx={commentTxModal} onClose={()=>setCommentTxModal(null)} />}
          </div>
        )}

        {view === 'party' && (
          <div className='form-container'>
            <h2>All Parties</h2>
            <PartyInfoTable parties={partiesInfo} onEditParty={setEditingParty} />
            <button className="addPurchase-button" onClick={() => setShowPartyForm(prev => !prev)} style={{ marginBottom: '10px' }}>
              {showPartyForm ? 'Cancel' : 'Add New Party'}
            </button>
            {showPartyForm && (
              <div className="party-form">
                <input placeholder="Business" value={partyInput.businessName} onChange={e => setPartyInput({ ...partyInput, businessName: e.target.value })} />
                <input placeholder="Phone" value={partyInput.phoneNumber} onChange={e => setPartyInput({ ...partyInput, phoneNumber: e.target.value })} />
                <input placeholder="Bank" value={partyInput.bankNumber} onChange={e => setPartyInput({ ...partyInput, bankNumber: e.target.value })} />
                <input placeholder="Bank Name" value={partyInput.bankName} onChange={e => setPartyInput({ ...partyInput, bankName: e.target.value })} />
                <input placeholder="Contact" value={partyInput.contactName} onChange={e => setPartyInput({ ...partyInput, contactName: e.target.value })} />
                <input placeholder="Mobile" value={partyInput.contactMobile} onChange={e => setPartyInput({ ...partyInput, contactMobile: e.target.value })} />
                <button onClick={handleAddParty} className="addPurchase-button">Save Party</button>
              </div>
            )}
            {editingParty && (
              <EditPartyModal party={editingParty} onClose={() => setEditingParty(null)} onSave={handleSaveParty} />
            )}
          </div>
        )}

        {view === 'bank' && (
          <div className="form-container">
            <h2>Bank Balance: ₹{(bankBalance || 0).toFixed(2)}</h2>
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Enter deposit amount" />
            <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} placeholder="Enter deposit date" />
            <button onClick={handleDeposit} className="addPurchase-button">Deposit</button>
            <div style={{ margin: '10px 0' }}>
              <button onClick={() => exportBankLedger('csv')}>Export CSV</button>
              <button onClick={() => exportBankLedger('pdf')} style={{ marginLeft: 8 }}>Export PDF</button>
            </div>
            <h2 style={{ marginTop: '20px' }}>Deposit History</h2>
            <table className="transaction-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Method</th>
                  <th>Check No.</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {getBankLedger().map((entry, index) => (
                  <tr key={index}>
                    <td>{new Date(entry.date).toLocaleString()}</td>
                    <td>{entry.party}</td>
                    <td>{entry.method}</td>
                    <td>{entry.checkNumber || '-'}</td>
                    <td style={{ color: entry.debit ? 'red' : 'black' }}>
                      {entry.debit ? `₹${asNumber(entry.debit).toFixed(2)}` : '-'}
                    </td>
                    <td style={{ color: entry.credit ? 'green' : 'black' }}>
                      {entry.credit ? `₹${asNumber(entry.credit).toFixed(2)}` : '-'}
                    </td>
                    <td>₹{asNumber(entry.balance).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'salary' && (
          <div className='form-container'>
            <h2>Salary Payment</h2>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="salaryPaymentName" value={form.salaryPaymentName} onChange={e => setForm({ ...form, date: e.target.value })} />
            <div style={{ margin: '10px 0' }}>
              <button onClick={() => exportSalaries('csv')}>Export CSV</button>
              <button onClick={() => exportSalaries('pdf')} style={{ marginLeft: 8 }}>Export PDF</button>
            </div>
            <SalaryTable salaries={salaryTransactions} />
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
