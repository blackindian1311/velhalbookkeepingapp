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
  
  // Get current salary period dates
  const periodStart = new Date(currentYear, currentMonth, employee.salaryPeriodStart);
  const periodEnd = new Date(currentYear, currentMonth, employee.salaryPeriodEnd);
  
  // If period end is before start, it means it goes to next month
  if (periodEnd < periodStart) {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  
  // Calculate total paid in current period
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
    
    // Only check if required fields are filled
    if (!payment || !paymentMethod || !date || !selectedParty) { 
      alert('Fill all payment fields.'); 
      return; 
    }
    
    // COMPLETELY REMOVED: All balance checking code
    // COMPLETELY REMOVED: owes calculation
    // COMPLETELY REMOVED: "Cannot pay more than owed" alert
    // COMPLETELY REMOVED: "No outstanding balance" alert
    
    // Now allows ANY payment amount - no restrictions
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
                  <td style={{ padding: '6px 4px', fontSize: '12px' }}>₹{asNumber(tx.amount).toFixed(2)}</td>
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

  // UPDATED: Simplified Salary Table - NO edit/delete columns
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

  // Export functions for each page
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
        headStyles: { fillColor: [41, 128, 185] }
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
        headStyles: { fillColor: [41, 128, 185] }
      });
      doc.save('return_history.pdf');
    }
  };

  const exportSalaryHistory = (format) => {
    const filtered = filterTransactionsByDate(salaryTransactions, salaryFilterStart, salaryFilterEnd);
    const headers = ['Date', 'Employee Name', 'Amount'];
    const data = filtered.map(tx => [
      formatDate(tx.date),
      tx.employeeName,
      `₹${asNumber(tx.amount).toFixed(2)}`
    ]);
    if (format === 'csv') {
      downloadCSV('salary_history.csv', [headers, ...data]);
    } else {
      const doc = new jsPDF();
      doc.text('Salary History Report', 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
      });
      doc.save('salary_history.pdf');
    }
  };

  const exportBalanceHistory = (format) => {
    const filtered = filterTransactionsByDate(
      filteredTransactions,
      balanceFilterStart,
      balanceFilterEnd
    );
    const headers = ['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Comment'];
    const data = filtered.map(tx => [
      formatDate(tx.date),
      tx.party,
      tx.type,
      `₹${asNumber(tx.amount).toFixed(2)}`,
      tx.type === 'purchase' ? `₹${(tx.gstAmount || 0).toFixed(2)}` : '-',
      tx.method || '-',
      tx.billNumber || '-',
      tx.comment || '-'
    ]);
    if (format === 'csv') {
      downloadCSV('balance_history.csv', [headers, ...data]);
    } else {
      const doc = new jsPDF();
      doc.text('Balance History Report', 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
      });
      doc.save('balance_history.pdf');
    }
  };

  const exportBankHistory = (format) => {
    const filtered = filterTransactionsByDate(getBankLedger(), bankFilterStart, bankFilterEnd);
    const headers = ['Date', 'Party', 'Method', 'Check No', 'Debit', 'Credit', 'Balance'];
    const data = filtered.map(entry => [
      formatDate(entry.date),
      entry.party,
      entry.method,
      entry.checkNumber || '-',
      entry.debit ? `₹${entry.debit.toFixed(2)}` : '-',
      entry.credit ? `₹${entry.credit.toFixed(2)}` : '-',
      `₹${entry.balance.toFixed(2)}`
    ]);
    if (format === 'csv') {
      downloadCSV('bank_history.csv', [headers, ...data]);
    } else {
      const doc = new jsPDF();
      doc.text('Bank Transaction History', 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
      });
      doc.save('bank_history.pdf');
    }
  };

  const exportPDF = () => {
    const from = new Date(exportStartDate);
    const to = new Date(exportEndDate);
    if (exportEndDate) to.setHours(23, 59, 59, 999);

    const doc = new jsPDF();
    doc.text('Velhal Bookkeeping Summary', 14, 15);

    const txRows = allTransactions.filter(tx => {
      if (!exportStartDate || !exportEndDate) return true;
      const d = new Date(tx.date);
      return d >= from && d <= to;
    }).map(tx => [
      formatDate(tx.date),
      tx.party,
      tx.type,
      asNumber(tx.amount),
      tx.method || '',
      tx.billNumber || '',
      tx.checkNumber || ''
    ]);

    autoTable(doc, {
      startY: 20,
      head: [['Date', 'Party', 'Type', 'Amount', 'Method', 'Bill No', 'Check No']],
      body: txRows,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save('velhal_summary.pdf');
  };

  const exportAllData = () => {
    const from = new Date(exportStartDate);
    const to = new Date(exportEndDate);
    if (exportEndDate) to.setHours(23, 59, 59, 999);

    const allTxRows = [['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Check No', 'Comment', 'GST Applied']];
    allTransactions.forEach(tx => {
      const d = new Date(tx.date);
      if (!exportStartDate || !exportEndDate || (d >= from && d <= to)) {
        allTxRows.push([
          formatDate(tx.date),
          tx.party,
          tx.type,
          asNumber(tx.amount),
          tx.gstAmount || '',
          tx.method || '',
          tx.billNumber || '',
          tx.checkNumber || '',
          tx.comment || '',
          tx.type === 'purchase' ? (tx.hasGST !== false ? 'Yes' : 'No') : '-'
        ]);
      }
    });

    const partyRows = [['Business', 'Phone', 'Bank', 'Bank Name', 'Contact', 'Mobile']];
    partiesInfo.forEach(p => partyRows.push([p.businessName, p.phoneNumber, p.bankNumber, p.bankName, p.contactName, p.contactMobile]));

    const bankRows = [['Date', 'Party', 'Method', 'Check No.', 'Debit', 'Credit', 'Balance']];
    getBankLedger().forEach(e => {
      const d = new Date(e.date);
      if (!exportStartDate || !exportEndDate || (d >= from && d <= to)) {
        bankRows.push([
          formatDate(e.date),
          e.party,
          e.method,
          e.checkNumber || '-',
          e.debit || '',
          e.credit || '',
          e.balance || ''
        ]);
      }
    });

    downloadCSV('transactions_filtered.csv', allTxRows);
    downloadCSV('parties.csv', partyRows);
    downloadCSV('bank_ledger_filtered.csv', bankRows);
  };

  // Filtered data for each view
  const homeFilteredTransactions = filterTransactionsByDate(allTransactions, homeFilterStart, homeFilterEnd);
  const purchaseFilteredTransactions = filterTransactionsByDate(
    purchaseTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
    purchaseFilterStart,
    purchaseFilterEnd
  );
  const paymentFilteredTransactions = filterTransactionsByDate(
    paymentTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
    paymentFilterStart,
    paymentFilterEnd
  );
  const returnFilteredTransactions = filterTransactionsByDate(
    returnTransactions.filter(tx => !selectedParty || tx.party === selectedParty),
    returnFilterStart,
    returnFilterEnd
  );
  const balanceFilteredTransactions = filterTransactionsByDate(filteredTransactions, balanceFilterStart, balanceFilterEnd);
  const bankFilteredLedger = filterTransactionsByDate(getBankLedger(), bankFilterStart, bankFilterEnd);
  const salaryFilteredTransactions = filterTransactionsByDate(salaryTransactions, salaryFilterStart, salaryFilterEnd);

  return (
    <div className='home-page'>
      <div className='sidebar'>
        <h1 className='nrv-logo'>NRV</h1>
        {['home', 'purchase', 'pay', 'return', 'balance', 'party', 'bank', 'employee', 'salary'].map(btn => (
          <button key={btn} style={{ marginBottom: '15px' }} onClick={() => setView(btn)}>
            {btn.charAt(0).toUpperCase() + btn.slice(1)}
          </button>
        ))}
      </div>

      <div className='content'>
        {editingTransaction && (
          <div className='modal'>
            <h3>Edit Transaction</h3>
            <label>Date: <input type='date' value={editForm.date || ''} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} /></label>
            <label>Party:
              <select value={editForm.party || ''} onChange={e => setEditForm(f => ({ ...f, party: e.target.value }))}>
                {partiesInfo.map((p, idx) => <option key={idx} value={p.businessName}>{p.businessName}</option>)}
              </select>
            </label>
            <label>Type: {editingTransaction.type}</label>
            <label>Amount{editingTransaction.type === 'purchase' ? ' (base amount)' : ''}: 
              <input type='number' value={editForm.amount || ''} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </label>
            {editingTransaction.type === 'purchase' && (
              <>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '100%',
                  marginTop: '15px',
                  marginBottom: '15px',
                  padding: '15px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <input 
                    type='checkbox' 
                    checked={editForm.hasGST} 
                    onChange={e => setEditForm(f => ({ ...f, hasGST: e.target.checked }))} 
                    style={{ 
                      marginRight: '12px',
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer'
                    }}
                  />
                  <span style={{ 
                    fontSize: '16px',
                    fontWeight: '500',
                    color: '#333'
                  }}>
                    Apply GST (5%)
                  </span>
                </div>
                {editForm.amount && !isNaN(asNumber(editForm.amount)) && (
                  <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                    {editForm.hasGST ? (
                      <>
                        <div>GST (5%): ₹{(asNumber(editForm.amount) * 0.05).toFixed(2)}</div>
                        <div>Total with GST: ₹{Math.round(asNumber(editForm.amount) * 1.05)}</div>
                      </>
                    ) : (
                      <div>Total (No GST): ₹{asNumber(editForm.amount).toFixed(2)}</div>
                    )}
                  </div>
                )}
              </>
            )}
            <label>Bill No: <input type='text' value={editForm.billNumber || ''} onChange={e => setEditForm(f => ({ ...f, billNumber: e.target.value }))} /></label>
            {editingTransaction.type === 'payment' && (
              <>
                <label>Method: <input type='text' value={editForm.method || ''} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} /></label>
                {editForm.method === 'Check' && (
                  <label>Check #: <input type='text' value={editForm.checkNumber || ''} onChange={e => setEditForm(f => ({ ...f, checkNumber: e.target.value }))} /></label>
                )}
              </>
            )}
            {editingTransaction.type === 'return' && (
              <label>Comment: <textarea value={editForm.comment || ''} onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))} /></label>
            )}
            <div style={{ marginTop: 8 }}>
              <button onClick={handleEditSave}>Save</button>
              <button onClick={handleEditCancel}>Cancel</button>
            </div>
          </div>
        )}

        {/* Employee Modals */}
        {(showAddEmployee || editingEmployee) && (
          <div className='modal'>
            <h3>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</h3>
            <div style={{ marginBottom: 15 }}>
              <label>Employee Name:</label>
              <input 
                type='text' 
                value={employeeForm.name} 
                onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})}
                placeholder="Enter employee name"
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
            </div>
            <div style={{ marginBottom: 15 }}>
              <label>Basic Salary (Optional):</label>
              <input 
                type='number' 
                value={employeeForm.basicSalary} 
                onChange={e => setEmployeeForm({...employeeForm, basicSalary: e.target.value})}
                placeholder="Enter basic salary"
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: 15 }}>
              <div style={{ flex: 1 }}>
                <label>Salary Period Start (Day of Month):</label>
                <input 
                  type='number' 
                  min="1" 
                  max="31"
                  value={employeeForm.salaryPeriodStart} 
                  onChange={e => setEmployeeForm({...employeeForm, salaryPeriodStart: e.target.value})}
                  placeholder="1"
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Salary Period End (Day of Month):</label>
                <input 
                  type='number' 
                  min="1" 
                  max="31"
                  value={employeeForm.salaryPeriodEnd} 
                  onChange={e => setEmployeeForm({...employeeForm, salaryPeriodEnd: e.target.value})}
                  placeholder="30"
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              {editingEmployee ? (
                <>
                  <button onClick={handleUpdateEmployee} style={{ marginRight: 10, padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Update Employee</button>
                  <button onClick={() => { setEditingEmployee(null); clearEmployeeForm(); }} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={handleAddEmployee} style={{ marginRight: 10, padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Add Employee</button>
                  <button onClick={() => { setShowAddEmployee(false); clearEmployeeForm(); }} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Cancel</button>
                </>
              )}
            </div>
          </div>
        )}

        {settingSalaryFor && (
          <div className='modal'>
            <h3>Salary Setup for {settingSalaryFor.name}</h3>
            <div style={{ marginBottom: 15 }}>
              <label>Basic Salary:</label>
              <input 
                type='number' 
                value={employeeForm.basicSalary} 
                onChange={e => setEmployeeForm({...employeeForm, basicSalary: e.target.value})}
                placeholder="Enter basic salary"
                style={{ width: '100%', padding: '8px', marginTop: '5px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: 15 }}>
              <div style={{ flex: 1 }}>
                <label>Salary Period Start (Day):</label>
                <input 
                  type='number' 
                  min="1" 
                  max="31"
                  value={employeeForm.salaryPeriodStart} 
                  onChange={e => setEmployeeForm({...employeeForm, salaryPeriodStart: e.target.value})}
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>Salary Period End (Day):</label>
                <input 
                  type='number' 
                  min="1" 
                  max="31"
                  value={employeeForm.salaryPeriodEnd} 
                  onChange={e => setEmployeeForm({...employeeForm, salaryPeriodEnd: e.target.value})}
                  style={{ width: '100%', padding: '8px', marginTop: '5px' }}
                />
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <button onClick={handleSaveSalarySetup} style={{ marginRight: 10, padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>Save Setup</button>
              <button onClick={() => { setSettingSalaryFor(null); clearEmployeeForm(); }} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}>Cancel</button>
            </div>
          </div>
        )}

        {viewingEmployee && (
          <div className='modal'>
            <div style={{ maxWidth: 600, minWidth: 500, margin: 'auto', border: '1px solid #bbb', borderRadius: 6, background: '#fff', padding: 20 }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: '36px', margin: '10px 0', color: '#333' }}>
                  {viewingEmployee.name.toUpperCase()}
                </h1>
                <div style={{ fontSize: '24px', color: '#007bff', fontWeight: 'bold' }}>
                  Remaining This Month: ₹{calculateRemainingSalary(viewingEmployee, salaryTransactions).toFixed(2)}
                </div>
              </div>
              
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                <h4 style={{ marginTop: 0 }}>Employee Details</h4>
                <p><strong>Basic Salary:</strong> ₹{viewingEmployee.basicSalary ? asNumber(viewingEmployee.basicSalary).toFixed(2) : 'Not Set'}</p>
                <p><strong>Salary Period:</strong> {viewingEmployee.salaryPeriodStart && viewingEmployee.salaryPeriodEnd 
                  ? `${viewingEmployee.salaryPeriodStart} to ${viewingEmployee.salaryPeriodEnd} of each month`
                  : 'Not Set'
                }</p>
                <p><strong>Last Updated:</strong> {viewingEmployee.salaryLastUpdated ? formatDate(viewingEmployee.salaryLastUpdated) : '-'}</p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <h4>Recent Salary Payments</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {salaryTransactions
                    .filter(sal => sal.employeeName === viewingEmployee.name)
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 5)
                    .map((sal, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: idx % 2 === 0 ? '#f8f9fa' : 'white', borderRadius: '4px', marginBottom: '4px' }}>
                        <span>{formatDate(sal.date)}</span>
                        <span>₹{asNumber(sal.amount).toFixed(2)}</span>
                      </div>
                    ))
                  }
                  {salaryTransactions.filter(sal => sal.employeeName === viewingEmployee.name).length === 0 && (
                    <p style={{ color: '#888' }}>No salary payments yet</p>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <button onClick={() => setViewingEmployee(null)} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {commentTxModal && <CommentModal tx={commentTxModal} onClose={() => setCommentTxModal(null)} />}

        {editingParty && (
          <EditPartyModal 
            party={editingParty} 
            onClose={() => setEditingParty(null)} 
            onSave={handleSaveParty}
          />
        )}

        {view === 'home' && (
          <>
            <h1>NANDKUMAR RAMACHANDRA VELHAL</h1>
            <h3>Total Owed to All Parties: ₹{(totalOwed || 0).toFixed(2)}</h3>
            <h4>
              All Transactions <br />
              <span style={{ fontWeight: 'normal' }}>
                Total GST on Purchases: ₹
                {allTransactions.filter(tx => tx.type === 'purchase' && tx.hasGST !== false).reduce((s, tx) => s + (Number(tx.gstAmount) || 0), 0).toFixed(2)}
              </span>
            </h4>
            
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={homeFilterStart} onChange={e => setHomeFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={homeFilterEnd} onChange={e => setHomeFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportAllData()} style={{ marginLeft: 12 }}>Export All (CSV)</button>
              <button onClick={exportPDF} style={{ marginLeft: 6 }}>Export All (PDF)</button>
            </div>

            <TransactionTable
              transactions={homeFilteredTransactions}
              onEdit={handleEditClick}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
          </>
        )}

        {view === 'employee' && (
          <div className='form-container'>
            <h2>Employee Management</h2>
            <button 
              className='addPurchase-button' 
              onClick={() => setShowAddEmployee(true)} 
              style={{ marginBottom: '20px' }}
            >
              Add New Employee
            </button>
            
            <EmployeeTable 
              employees={employees} 
              onEditEmployee={handleEditEmployee}
              onSetupSalary={handleSetupSalary}
              onViewEmployee={handleViewEmployee}
            />
          </div>
        )}

        {view === 'purchase' && (
          <div className='form-container'>
            <h2>Purchase Entry</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value=''>Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type='date' value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type='text' placeholder='Bill No' value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} />
            <input type='number' placeholder='Amount' value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              marginTop: '15px',
              marginBottom: '15px',
              padding: '15px',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              backgroundColor: '#f9f9f9'
            }}>
              <input 
                type='checkbox' 
                checked={form.hasGST} 
                onChange={e => setForm({ ...form, hasGST: e.target.checked })} 
                style={{ 
                  marginRight: '12px',
                  width: '18px',
                  height: '18px',
                  cursor: 'pointer'
                }}
              />
              <span style={{ 
                fontSize: '16px',
                fontWeight: '500',
                color: '#333'
              }}>
                Apply GST (5%)
              </span>
            </div>
            
            <button className='addPurchase-button' onClick={handleAddPurchase}>Add Purchase</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            {form.amount && !isNaN(asNumber(form.amount)) && (
              <div style={{ marginTop: 10 }}>
                {form.hasGST ? (
                  <>
                    <p>GST (5%): ₹{(asNumber(form.amount) * 0.05).toFixed(2)}</p>
                    <p>Total with GST: ₹{Math.round(asNumber(form.amount) * 1.05)}</p>
                  </>
                ) : (
                  <p>Total (No GST): ₹{asNumber(form.amount).toFixed(2)}</p>
                )}
              </div>
            )}
            
            <h3 style={{ marginTop: '30px' }}>Purchase History</h3>
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={purchaseFilterStart} onChange={e => setPurchaseFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={purchaseFilterEnd} onChange={e => setPurchaseFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportPurchaseHistory('csv')} style={{ marginLeft: 12 }}>Export CSV</button>
              <button onClick={() => exportPurchaseHistory('pdf')} style={{ marginLeft: 6 }}>Export PDF</button>
            </div>
            <TransactionTable
              transactions={purchaseFilteredTransactions}
              onEdit={handleEditClick}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
          </div>
        )}

        {view === 'pay' && (
          <div className='form-container'>
            <h2>Payment</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value=''>Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type='date' value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type='number' placeholder='Amount' value={form.payment} onChange={e => setForm({ ...form, payment: e.target.value })} />
            <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
              <option value=''>Select Payment Method</option>
              <option value='Cash'>Cash</option>
              <option value='NEFT'>NEFT</option>
              <option value='Check'>Check</option>
            </select>
            {form.paymentMethod === 'Check' && (
              <input type='text' placeholder='Enter Check Number' value={form.checkNumber || ''} onChange={e => setForm({ ...form, checkNumber: e.target.value })} />
            )}
            <button className='addPurchase-button' onClick={handleAddPayment}>Add Payment</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            
            <h3 style={{ marginTop: '30px' }}>Payment History</h3>
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={paymentFilterStart} onChange={e => setPaymentFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={paymentFilterEnd} onChange={e => setPaymentFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportPaymentHistory('csv')} style={{ marginLeft: 12 }}>Export CSV</button>
              <button onClick={() => exportPaymentHistory('pdf')} style={{ marginLeft: 6 }}>Export PDF</button>
            </div>
            <TransactionTable
              transactions={paymentFilteredTransactions}
              onEdit={handleEditClick}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
          </div>
        )}

        {view === 'return' && (
          <div className='form-container'>
            <h2>Return</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value=''>Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type='number' placeholder='Return Amount' value={form.returnAmount} onChange={e => setForm({ ...form, returnAmount: e.target.value })} />
            <input type='text' placeholder='Bill No' value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} />
            <input type='date' value={form.returnDate} onChange={e => setForm({ ...form, returnDate: e.target.value })} />
            <textarea placeholder='Why was the product returned?' value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} style={{ width: '100%', minHeight: 36, marginTop: 8 }} />
            <button className='addPurchase-button' onClick={handleAddReturn}>Add Return</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            
            <h3 style={{ marginTop: '30px' }}>Return History</h3>
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={returnFilterStart} onChange={e => setReturnFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={returnFilterEnd} onChange={e => setReturnFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportReturnHistory('csv')} style={{ marginLeft: 12 }}>Export CSV</button>
              <button onClick={() => exportReturnHistory('pdf')} style={{ marginLeft: 6 }}>Export PDF</button>
            </div>
            <TransactionTable
              transactions={returnFilteredTransactions}
              onEdit={handleEditClick}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
          </div>
        )}

        {view === 'balance' && (
          <div className='form-container'>
            <h2>Balance for: {selectedParty || 'None selected'}</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value=''>Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <p>Total Owed: ₹{(totalOwed || 0).toFixed(2)}</p>
            <p>
              Total GST on Purchases: ₹
              {filteredTransactions.filter(tx => tx.type === 'purchase' && tx.hasGST !== false).reduce((s, tx) => s + (Number(tx.gstAmount) || 0), 0).toFixed(2)}
            </p>
            
            <h3 style={{ marginTop: '30px' }}>Balance History</h3>
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={balanceFilterStart} onChange={e => setBalanceFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={balanceFilterEnd} onChange={e => setBalanceFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportBalanceHistory('csv')} style={{ marginLeft: 12 }}>Export CSV</button>
              <button onClick={() => exportBalanceHistory('pdf')} style={{ marginLeft: 6 }}>Export PDF</button>
            </div>
            <TransactionTable
              transactions={balanceFilteredTransactions}
              onEdit={handleEditClick}
              onSeeComment={setCommentTxModal}
              onDelete={handleDeleteTransaction}
            />
          </div>
        )}

        {view === 'party' && (
          <div className='form-container'>
            <h2>All Parties</h2>
            <PartyInfoTable parties={partiesInfo} onEditParty={handleEditParty} />
            <button className='addPurchase-button' onClick={() => setShowPartyForm(s => !s)} style={{ margin: '18px 0 16px 0' }}>
              {showPartyForm ? 'Cancel' : 'Add New Party'}
            </button>
            {showPartyForm && (
              <div className='party-form'>
                <input placeholder='Business' value={partyInput.businessName} onChange={e => setPartyInput({ ...partyInput, businessName: e.target.value })} />
                <input placeholder='Phone' value={partyInput.phoneNumber} onChange={e => setPartyInput({ ...partyInput, phoneNumber: e.target.value })} />
                <input placeholder='Bank' value={partyInput.bankNumber} onChange={e => setPartyInput({ ...partyInput, bankNumber: e.target.value })} />
                <input placeholder='Bank Name' value={partyInput.bankName} onChange={e => setPartyInput({ ...partyInput, bankName: e.target.value })} />
                <input placeholder='Contact' value={partyInput.contactName} onChange={e => setPartyInput({ ...partyInput, contactName: e.target.value })} />
                <input placeholder='Mobile' value={partyInput.contactMobile} onChange={e => setPartyInput({ ...partyInput, contactMobile: e.target.value })} />
                <button onClick={handleAddParty} className='addPurchase-button'>Save Party</button>
              </div>
            )}
          </div>
        )}

        {view === 'bank' && (
          <div className='form-container'>
            <h2>Bank Balance: ₹{(bankBalance || 0).toFixed(2)}</h2>
            <input type='number' value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder='Enter deposit amount' />
            <input type='date' value={depositDate} onChange={e => setDepositDate(e.target.value)} placeholder='Enter deposit date' />
            <button onClick={handleDeposit} className='addPurchase-button'>Deposit</button>

            <h2 style={{ marginTop: '20px' }}>Bank Transaction History</h2>
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={bankFilterStart} onChange={e => setBankFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={bankFilterEnd} onChange={e => setBankFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportBankHistory('csv')} style={{ marginLeft: 12 }}>Export CSV</button>
              <button onClick={() => exportBankHistory('pdf')} style={{ marginLeft: 6 }}>Export PDF</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className='transaction-table' style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 6px' }}>Date</th>
                    <th style={{ padding: '8px 6px' }}>Party</th>
                    <th style={{ padding: '8px 6px' }}>Method</th>
                    <th style={{ padding: '8px 6px' }}>Check No.</th>
                    <th style={{ padding: '8px 6px' }}>Debit</th>
                    <th style={{ padding: '8px 6px' }}>Credit</th>
                    <th style={{ padding: '8px 6px' }}>Balance</th>
                    <th style={{ padding: '8px 6px' }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {bankFilteredLedger.map((e, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '6px', fontSize: '12px' }}>{formatDate(e.date)}</td>
                      <td style={{ padding: '6px', fontSize: '12px' }}>{e.party}</td>
                      <td style={{ padding: '6px', fontSize: '12px' }}>{e.method}</td>
                      <td style={{ padding: '6px', fontSize: '12px' }}>{e.checkNumber || '-'}</td>
                      <td style={{ padding: '6px', fontSize: '12px', color: e.debit ? 'red' : 'black' }}>{e.debit ? `₹${e.debit.toFixed(2)}` : '-'}</td>
                      <td style={{ padding: '6px', fontSize: '12px', color: e.credit ? 'green' : 'black' }}>{e.credit ? `₹${e.credit.toFixed(2)}` : '-'}</td>
                      <td style={{ padding: '6px', fontSize: '12px' }}>₹{e.balance.toFixed(2)}</td>
                      <td style={{ padding: '6px' }}>
                        {e.type === 'deposit' && e.source === 'bankDeposits' && e.isPaymentDeduction !== true
                          ? <button onClick={() => handleDeleteBankEntry(e)} style={{ padding: '4px 6px', fontSize: '11px', color: 'white', background: '#dc3545', border: 'none', borderRadius: '3px' }}>Del</button>
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'salary' && (
          <div className='form-container'>
            <h2>Salary Payment</h2>
            
            {/* Employee Selection with Big Name Display */}
            <select 
              value={selectedEmployee} 
              onChange={e => setSelectedEmployee(e.target.value)}
              style={{ marginBottom: '20px', padding: '10px', width: '100%', fontSize: '16px' }}
            >
              <option value=''>Select Employee</option>
              {employees.map((emp, i) => (
                <option key={i} value={emp.name}>{emp.name}</option>
              ))}
            </select>

            {selectedEmployee && (
              <div style={{ 
                textAlign: 'center', 
                marginBottom: '20px', 
                padding: '20px', 
                background: '#f8f9fa', 
                borderRadius: '8px',
                border: '2px solid #007bff'
              }}>
                <h1 style={{ 
                  fontSize: '48px', 
                  margin: '10px 0', 
                  color: '#007bff',
                  textTransform: 'uppercase',
                  letterSpacing: '2px'
                }}>
                  {selectedEmployee}
                </h1>
                <div style={{ fontSize: '24px', color: '#28a745', fontWeight: 'bold' }}>
                  {(() => {
                    const emp = employees.find(e => e.name === selectedEmployee);
                    return emp ? `Remaining This Month: ₹${calculateRemainingSalary(emp, salaryTransactions).toFixed(2)}` : 'Employee not found';
                  })()}
                </div>
                {(() => {
                  const emp = employees.find(e => e.name === selectedEmployee);
                  return emp && emp.basicSalary ? (
                    <div style={{ fontSize: '18px', color: '#666', marginTop: '10px' }}>
                      Basic Salary: ₹{asNumber(emp.basicSalary).toFixed(2)} | 
                      Period: {emp.salaryPeriodStart}-{emp.salaryPeriodEnd} of month
                    </div>
                  ) : (
                    <div style={{ fontSize: '16px', color: '#dc3545', marginTop: '10px' }}>
                      ⚠️ Salary not configured for this employee
                    </div>
                  );
                })()}
              </div>
            )}
            
            <input 
              type='date' 
              value={form.salaryDate} 
              onChange={e => setForm({ ...form, salaryDate: e.target.value })} 
              placeholder='Select Date'
              style={{ marginBottom: '10px' }}
            />
            <input 
              type='number' 
              placeholder='Salary Amount' 
              value={form.salaryAmount} 
              onChange={e => setForm({ ...form, salaryAmount: e.target.value })}
              style={{ marginBottom: '10px' }}
            />
            
            <div style={{ marginBottom: '20px' }}>
              <button className='addPurchase-button' onClick={handleAddSalary}>Pay Salary</button>
              <button className='clearForm-button' onClick={() => { clearFormFields(); setSelectedEmployee(''); }} style={{ marginLeft: 12 }}>Clear</button>
            </div>

            <h3 style={{ marginTop: '30px' }}>Salary History</h3>
            <div style={{ marginBottom: '15px' }}>
              <label>From: <input type='date' value={salaryFilterStart} onChange={e => setSalaryFilterStart(e.target.value)} /></label>
              <label style={{ marginLeft: 12 }}>To: <input type='date' value={salaryFilterEnd} onChange={e => setSalaryFilterEnd(e.target.value)} /></label>
              <button onClick={() => exportSalaryHistory('csv')} style={{ marginLeft: 12 }}>Export CSV</button>
              <button onClick={() => exportSalaryHistory('pdf')} style={{ marginLeft: 6 }}>Export PDF</button>
            </div>
            <SalaryTable salaries={salaryFilteredTransactions} />
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
