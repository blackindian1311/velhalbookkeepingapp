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

  // Bank ledger (salary excluded)
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

  // Employee Management Functions
  const handleAddEmployee = async () => {
    if (!employeeForm.name.trim()) {
      alert('Please enter employee name.');
      return;
    }
    try {
      const employeeData = {
        name: employeeForm.name.trim(),
        createdDate: new Date().toISOString(),
        basicSalary: employeeForm.basicSalary ? asNumber(employeeForm.basicSalary) : null,
        salaryPeriodStart: employeeForm.salaryPeriodStart || null,
        salaryPeriodEnd: employeeForm.salaryPeriodEnd || null,
        salaryLastUpdated: employeeForm.basicSalary ? new Date().toISOString() : null
      };
      await addDoc(collection(db, 'employees'), employeeData);
      clearEmployeeForm();
      setShowAddEmployee(false);
      alert('Employee added successfully!');
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Failed to add employee.');
    }
  };

  const handleEditEmployee = (employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name,
      basicSalary: employee.basicSalary || '',
      salaryPeriodStart: employee.salaryPeriodStart || '',
      salaryPeriodEnd: employee.salaryPeriodEnd || ''
    });
  };

  const handleUpdateEmployee = async () => {
    if (!employeeForm.name.trim()) {
      alert('Please enter employee name.');
      return;
    }
    try {
      const updatedData = {
        name: employeeForm.name.trim(),
        basicSalary: employeeForm.basicSalary ? asNumber(employeeForm.basicSalary) : editingEmployee.basicSalary,
        salaryPeriodStart: employeeForm.salaryPeriodStart || editingEmployee.salaryPeriodStart,
        salaryPeriodEnd: employeeForm.salaryPeriodEnd || editingEmployee.salaryPeriodEnd,
        salaryLastUpdated: employeeForm.basicSalary !== String(editingEmployee.basicSalary) ? new Date().toISOString() : editingEmployee.salaryLastUpdated
      };
      await updateDoc(doc(db, 'employees', editingEmployee.id), updatedData);
      setEditingEmployee(null);
      clearEmployeeForm();
      alert('Employee updated successfully!');
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Failed to update employee.');
    }
  };

  const handleSetupSalary = (employee) => {
    setSettingSalaryFor(employee);
    setEmployeeForm({
      name: employee.name,
      basicSalary: employee.basicSalary || '',
      salaryPeriodStart: employee.salaryPeriodStart || '1',
      salaryPeriodEnd: employee.salaryPeriodEnd || '30'
    });
  };

  const handleSaveSalarySetup = async () => {
    if (!employeeForm.basicSalary || !employeeForm.salaryPeriodStart || !employeeForm.salaryPeriodEnd) {
      alert('Please fill all salary setup fields.');
      return;
    }
    try {
      const updatedData = {
        basicSalary: asNumber(employeeForm.basicSalary),
        salaryPeriodStart: parseInt(employeeForm.salaryPeriodStart),
        salaryPeriodEnd: parseInt(employeeForm.salaryPeriodEnd),
        salaryLastUpdated: new Date().toISOString()
      };
      await updateDoc(doc(db, 'employees', settingSalaryFor.id), updatedData);
      setSettingSalaryFor(null);
      clearEmployeeForm();
      alert('Salary setup completed successfully!');
    } catch (error) {
      console.error('Error setting up salary:', error);
      alert('Failed to setup salary.');
    }
  };

  const handleViewEmployee = (employee) => {
    setViewingEmployee(employee);
  };

  const handleDeleteTransaction = async (tx) => {
    const msg =
      tx.type === 'purchase' ? `Delete purchase ₹${asNumber(tx.amount).toFixed(2)} for ${tx.party}?` :
      tx.type === 'payment' ? `Delete ${tx.method || ''} payment ₹${asNumber(tx.amount).toFixed(2)} for ${tx.party}?` :
      `Delete return ₹${asNumber(tx.amount).toFixed(2)} for ${tx.party}?`;
    if (!window.confirm(msg)) return;
    try {
      const coll = tx.type === 'purchase' ? 'purchases' : tx.type === 'payment' ? 'payments' : 'returns';

      if (tx.type === 'payment' && tx.method && tx.method !== 'Cash') {
        const amount = asNumber(tx.amount);
        await setDoc(doc(db, 'meta', 'bank'), { balance: asNumber(bankBalance) + amount });

        const bdRef = collection(db, 'bankDeposits');
        const snap = await getDocs(query(bdRef, where('isPaymentDeduction', '==', true)));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        let match = list.find(d =>
          asNumber(d.amount) === -amount &&
          (d.party || '') === (tx.party || '') &&
          String(d.date) === String(tx.date)
        );
        if (!match) match = list.find(d => asNumber(d.amount) === -amount);
        if (match) await deleteDoc(doc(db, 'bankDeposits', match.id));
      }

      await deleteDoc(doc(db, coll, tx.id));
      alert('Transaction deleted.');
    } catch (e) {
      console.error(e);
      alert('Failed to delete transaction.');
    }
  };

  const handleDeleteBankEntry = async (entry) => {
    if (entry.type !== 'deposit' || entry.source !== 'bankDeposits' || entry.isPaymentDeduction === true) {
      alert('Only manual bank entries can be deleted here.');
      return;
    }
    if (!window.confirm('Delete this bank entry and adjust bank balance?')) return;
    try {
      const delta = entry.credit ? -entry.credit : entry.debit ? entry.debit : 0;
      await setDoc(doc(db, 'meta', 'bank'), { balance: asNumber(bankBalance) + delta });
      await deleteDoc(doc(db, 'bankDeposits', entry.id));
      alert('Bank entry deleted.');
    } catch (e) {
      console.error(e);
      alert('Failed to delete bank entry.');
    }
  };

  const handleEditParty = (party) => {
    setEditingParty(party);
  };

  const handleSaveParty = async (partyId, partyData) => {
    try {
      await updateDoc(doc(db, 'parties', partyId), partyData);
      alert('Party details updated successfully.');
    } catch (e) {
      console.error(e);
      alert('Failed to update party details.');
    }
  };

  const handleAddParty = async () => {
    const f = partyInput;
    if (f.businessName && f.phoneNumber && f.bankNumber && f.contactName && f.contactMobile && f.bankName) {
      await addDoc(collection(db, 'parties'), { ...f });
      setPartyInput({ businessName: '', phoneNumber: '', bankNumber: '', contactName: '', contactMobile: '', bankName: '' });
      setShowPartyForm(false);
    } else alert('Please fill all fields.');
  };

  const handleAddPurchase = async () => {
    const { amount, billNumber, date, hasGST } = form;
    if (!amount || !billNumber || !date || !selectedParty) { alert('Fill all purchase fields.'); return; }
    const baseAmt = asNumber(amount);
    if (baseAmt <= 0) { alert('Enter valid amount'); return; }
    let finalAmount, gstAmount;
    if (hasGST) {
      gstAmount = baseAmt * 0.05;
      finalAmount = Math.round(baseAmt + gstAmount);
    } else {
      gstAmount = 0;
      finalAmount = baseAmt;
    }
    await addDoc(collection(db, 'purchases'), {
      type: 'purchase',
      amount: finalAmount,
      gstAmount: gstAmount,
      baseAmount: baseAmt,
      hasGST: hasGST,
      party: selectedParty,
      billNumber,
      date
    });
    clearFormFields();
  };

  // COMPLETELY UPDATED: Payment handler with ALL restrictions removed
  const handleAddPayment = async () => {
    const { payment, paymentMethod, date, checkNumber } = form;
    const amountToPay = asNumber(payment);
    if (!payment || !paymentMethod || !date || !selectedParty) {
      alert('Fill all payment fields.');
      return;
    }
    await addDoc(collection(db, 'payments'), {
      type: 'payment',
      amount: amountToPay,
      method: paymentMethod,
      party: selectedParty,
      date,
      checkNumber: paymentMethod === 'Check' ? checkNumber : null
    });
    if (paymentMethod !== 'Cash') {
      await setDoc(doc(db, 'meta', 'bank'), { balance: bankBalance - amountToPay });
      await addDoc(collection(db, 'bankDeposits'), {
        amount: -amountToPay,
        date,
        party: selectedParty,
        isPaymentDeduction: true,
        paymentMethod
      });
    }
    clearFormFields();
  };

  const handleAddReturn = async () => {
    const { returnAmount, returnDate, billNumber, comment } = form;
    if (!returnAmount || !returnDate || !selectedParty) { alert('Fill all return fields.'); return; }
    if (!comment.trim()) { alert('Please provide a comment for the return.'); return; }
    await addDoc(collection(db, 'returns'), {
      type: 'return', amount: asNumber(returnAmount), party: selectedParty,
      date: returnDate, billNumber: billNumber || null, comment
    });
    clearFormFields();
  };

  // UPDATED: Salary handler - NO bank connection, but with employee selection
  const handleAddSalary = async () => {
    const { salaryDate, salaryAmount } = form;
    if (!salaryDate || !salaryAmount || !selectedEmployee) {
      alert('Please fill all salary fields and select an employee.');
      return;
    }
    const amount = asNumber(salaryAmount);
    if (amount <= 0) { alert('Enter valid salary amount'); return; }
    await addDoc(collection(db, 'salaries'), {
      type: 'salary',
      amount: amount,
      employeeName: selectedEmployee,
      date: salaryDate
    });
    clearFormFields();
    setSelectedEmployee('');
    alert('Salary payment recorded successfully.');
  };

  const handleDeposit = async () => {
    const amount = asNumber(depositAmount);
    const dateToUse = depositDate || new Date().toISOString();
    if (amount > 0) {
      await setDoc(doc(db, 'meta', 'bank'), { balance: bankBalance + amount });
      await addDoc(collection(db, 'bankDeposits'), {
        amount, date: dateToUse, isPaymentDeduction: false
      });
      setDepositAmount(''); setDepositDate('');
    } else alert('Please enter a valid number');
  };

  const handleEditClick = (tx) => {
    setEditingTransaction(tx);
    const editAmount = tx.type === 'purchase' && tx.baseAmount ? tx.baseAmount : asNumber(tx.amount);
    setEditForm({
      ...tx,
      amount: editAmount,
      billNumber: tx.billNumber || '',
      checkNumber: tx.checkNumber || '',
      method: tx.method || '',
      date: tx.date || '',
      party: tx.party || '',
      comment: tx.comment || '',
      hasGST: tx.hasGST !== false
    });
  };

  const handleEditSave = async () => {
    const tx = editingTransaction;
    if (!editForm.amount || !editForm.date) { alert('Fill all required fields.'); return; }
    const coll = tx.type === 'purchase' ? 'purchases' : tx.type === 'payment' ? 'payments' : 'returns';
    let newData = { ...tx, ...editForm };
    if (tx.type === 'purchase') {
      const baseAmt = asNumber(editForm.amount);
      let gstAmount, finalAmount;
      if (editForm.hasGST) {
        gstAmount = baseAmt * 0.05;
        finalAmount = Math.round(baseAmt + gstAmount);
      } else {
        gstAmount = 0;
        finalAmount = baseAmt;
      }
      newData = {
        ...newData,
        baseAmount: baseAmt,
        gstAmount: gstAmount,
        amount: finalAmount,
        hasGST: editForm.hasGST
      };
    } else {
      newData.amount = asNumber(editForm.amount);
    }
    newData.billNumber = editForm.billNumber || null;
    newData.comment = editForm.comment || '';
    await updateDoc(doc(db, coll, tx.id), newData);
    setEditingTransaction(null);
    setEditForm({});
  };

  const handleEditCancel = () => {
    setEditingTransaction(null);
    setEditForm({});
  };

  // Show base amount (before GST) only in the Amount cell for purchases
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
                  ? '₹' + (tx.gstAmount !== undefined
                    ? Number(tx.gstAmount).toFixed(2)
                    : ((asNumber(tx.amount) / 1.05) * 0.05).toFixed(2))
                  : '₹0.00')
                : '-';
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
                  {/* Amount shows base for purchases, unchanged for others */}
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>₹{getDisplayAmount(tx).toFixed(2)}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{gst}</td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>
                    {debit !== null ? `₹${asNumber(debit).toFixed(2)}` : '-'}
                  </td>
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>{credit !== null ? `₹${asNumber(credit).toFixed(2)}` : '-'}</td>
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

  // Simplified Salary Table - unchanged
  const SalaryTable = ({ salaries }) => {
    const sorted = salaries.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    return (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table className='transaction-table' style={{
          width: '100%',
          minWidth: '400px',
          fontSize: '13px',
          borderCollapse: 'collapse'
        }}>
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

  // Export functions (unchanged output headers; purchase still exported as total unless you want base there too)
  const exportPurchaseHistory = (format) => {
    const filtered = filterTransactionsByDate(
      purchaseTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
      purchaseFilterStart,
      purchaseFilterEnd
    );
    const headers = ['Date', 'Party', 'Amount', 'GST', 'Bill No', 'GST Applied', 'Comment'];
    const data = filtered.map(tx => [
      formatDate(tx.date),
      tx.party,
      // Keeping original export as total amount to avoid changing your reports UI/format
      `₹${asNumber(tx.amount).toFixed(2)}`,
      `₹${(tx.gstAmount || 0).toFixed(2)}`,
      tx.billNumber || '-',
      tx.hasGST !== false ? 'Yes' : 'No',
      tx.comment || '-'
    ]);
    if (format === 'csv') {
      downloadCSV('purchase_history.csv', [headers, ...data]);
    } else {
      const doc = new jsPDF();
      doc.text('Purchase History Report', 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
      });
      doc.save('purchase_history.pdf');
    }
  };

  const exportPaymentHistory = (format) => {
    const filtered = filterTransactionsByDate(
      paymentTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
      paymentFilterStart,
      paymentFilterEnd
    );
    const headers = ['Date', 'Party', 'Amount', 'Method', 'Check No', 'Comment'];
    const data = filtered.map(tx => [
      formatDate(tx.date),
      tx.party,
      `₹${asNumber(tx.amount).toFixed(2)}`,
      tx.method || '-',
      tx.checkNumber || '-',
      tx.comment || '-'
    ]);
    if (format === 'csv') {
      downloadCSV('payment_history.csv', [headers, ...data]);
    } else {
      const doc = new jsPDF();
      doc.text('Payment History Report', 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [46, 204, 113] }
      });
      doc.save('payment_history.pdf');
    }
  };

  const exportReturnHistory = (format) => {
    const filtered = filterTransactionsByDate(
      returnTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
      returnFilterStart,
      returnFilterEnd
    );
    const headers = ['Date', 'Party', 'Amount', 'Bill No', 'Comment'];
    const data = filtered.map(tx => [
      formatDate(tx.date),
      tx.party,
      `₹${asNumber(tx.amount).toFixed(2)}`,
      tx.billNumber || '-',
      tx.comment || '-'
    ]);
    if (format === 'csv') {
      downloadCSV('return_history.csv', [headers, ...data]);
    } else {
      const doc = new jsPDF();
      doc.text('Return History Report', 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [231, 76, 60] }
      });
      doc.save('return_history.pdf');
    }
  };

  // Basic views (unchanged)
  const currentTransactionsView = () => {
    const base = [...purchaseTransactions, ...paymentTransactions, ...returnTransactions];
    const filtered = filterTransactionsByDate(
      selectedParty ? base.filter(tx => tx.party === selectedParty) : base,
      homeFilterStart,
      homeFilterEnd
    );
    return (
      <TransactionTable
        transactions={filtered}
        onEdit={handleEditClick}
        onSeeComment={setCommentTxModal}
        onDelete={handleDeleteTransaction}
      />
    );
  };

  const purchaseTransactionsView = () => {
    const filtered = filterTransactionsByDate(
      purchaseTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
      purchaseFilterStart,
      purchaseFilterEnd
    );
    return (
      <TransactionTable
        transactions={filtered}
        onEdit={handleEditClick}
        onSeeComment={setCommentTxModal}
        onDelete={handleDeleteTransaction}
      />
    );
  };

  const paymentTransactionsView = () => {
    const filtered = filterTransactionsByDate(
      paymentTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
      paymentFilterStart,
      paymentFilterEnd
    );
    return (
      <TransactionTable
        transactions={filtered}
        onEdit={handleEditClick}
        onSeeComment={setCommentTxModal}
        onDelete={handleDeleteTransaction}
      />
    );
  };

  const returnTransactionsView = () => {
    const filtered = filterTransactionsByDate(
      returnTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
      returnFilterStart,
      returnFilterEnd
    );
    return (
      <TransactionTable
        transactions={filtered}
        onEdit={handleEditClick}
        onSeeComment={setCommentTxModal}
        onDelete={handleDeleteTransaction}
      />
    );
  };

  const bankLedgerView = () => {
    const ledger = getBankLedger().filter(e => {
      if (bankFilterStart && new Date(e.date) < new Date(bankFilterStart)) return false;
      if (bankFilterEnd) {
        const end = new Date(bankFilterEnd);
        end.setHours(23,59,59,999);
        if (new Date(e.date) > end) return false;
      }
      return true;
    });
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className='transaction-table'>
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Method</th>
              <th>Check No</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888' }}>No bank entries.</td></tr>
            )}
            {ledger.map((e, i) => (
              <tr key={i}>
                <td>{formatDate(e.date)}</td>
                <td>{e.party || '-'}</td>
                <td>{e.method}</td>
                <td>{e.checkNumber}</td>
                <td>{e.debit ? `₹${asNumber(e.debit).toFixed(2)}` : '-'}</td>
                <td>{e.credit ? `₹${asNumber(e.credit).toFixed(2)}` : '-'}</td>
                <td>₹{asNumber(e.balance).toFixed(2)}</td>
                <td>
                  <button onClick={() => handleDeleteBankEntry(e)} style={{ padding: '4px 6px', fontSize: '11px', color: 'white', background: '#dc3545', border: 'none', borderRadius: '3px' }}>
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Transactions</h2>
      {currentTransactionsView()}
      <h2>Purchases</h2>
      {purchaseTransactionsView()}
      <h2>Payments</h2>
      {paymentTransactionsView()}
      <h2>Returns</h2>
      {returnTransactionsView()}
      <h2>Bank Ledger</h2>
      {bankLedgerView()}

      {commentTxModal && (
        <CommentModal tx={commentTxModal} onClose={() => setCommentTxModal(null)} />
      )}
      {editingParty && (
        <EditPartyModal
          party={editingParty}
          onClose={() => setEditingParty(null)}
          onSave={handleSaveParty}
        />
      )}
      {editingTransaction && (
        <div className='modal'>
          <div style={{ maxWidth: 500, minWidth: 400, margin: 'auto', border: '1px solid #bbb', borderRadius: 6, background: '#fff', padding: 20 }}>
            <h3>Edit Transaction</h3>
            <div style={{ marginBottom: 10 }}>
              <label>Amount (base before GST for purchase):</label>
              <input
                type='number'
                value={editForm.amount || ''}
                onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Date:</label>
              <input
                type='date'
                value={editForm.date ? editForm.date.substring(0,10) : ''}
                onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </div>
            {editingTransaction.type === 'purchase' && (
              <div style={{ marginBottom: 10 }}>
                <label>GST Applied:</label>
                <input
                  type='checkbox'
                  checked={editForm.hasGST}
                  onChange={e => setEditForm({ ...editForm, hasGST: e.target.checked })}
                  style={{ marginLeft: 8 }}
                />
              </div>
            )}
            <div style={{ marginBottom: 10 }}>
              <label>Bill Number:</label>
              <input
                type='text'
                value={editForm.billNumber || ''}
                onChange={e => setEditForm({ ...editForm, billNumber: e.target.value })}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Comment:</label>
              <textarea
                value={editForm.comment || ''}
                onChange={e => setEditForm({ ...editForm, comment: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: 8, marginTop: 4 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleEditSave} style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: 4 }}>
                Save
              </button>
              <button onClick={handleEditCancel} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: 4 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomePage;
