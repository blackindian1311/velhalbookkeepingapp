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

const PartyInfoTable = ({ parties = [] }) => {
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
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#888' }}>No parties found.</td></tr>
            )}
            {shown.map((p, i) => (
              <tr key={i}>
                <td>{p.businessName}</td>
                <td>{p.phoneNumber}</td>
                <td>{p.bankNumber}</td>
                <td>{p.bankName}</td>
                <td>{p.contactName}</td>
                <td>{p.contactMobile}</td>
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

const HomePage = () => {
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [commentTxModal, setCommentTxModal] = useState(null);
  const [view, setView] = useState('home');

  const [bankBalance, setBankBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDate, setDepositDate] = useState('');

  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [returnTransactions, setReturnTransactions] = useState([]);
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
    salaryPaymentName: '',
    comment: ''
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
    const unsubDepos = onSnapshot(collection(db, 'bankDeposits'), snap =>
      setBankDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubBank = onSnapshot(doc(db, 'meta', 'bank'), ds =>
      setBankBalance(ds.exists() ? (ds.data().balance || 0) : 0)
    );
    return () => {
      unsubParties(); unsubPurch(); unsubPay(); unsubRet(); unsubDepos(); unsubBank();
    };
  }, []);

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
    checkNumber: '', salaryPaymentName: '', comment: ''
  });

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

  const handleAddParty = async () => {
    const f = partyInput;
    if (f.businessName && f.phoneNumber && f.bankNumber && f.contactName && f.contactMobile && f.bankName) {
      await addDoc(collection(db, 'parties'), { ...f });
      setPartyInput({ businessName: '', phoneNumber: '', bankNumber: '', contactName: '', contactMobile: '', bankName: '' });
      setShowPartyForm(false);
    } else alert('Please fill all fields.');
  };

  const handleAddPurchase = async () => {
    const { amount, billNumber, date } = form;
    if (!amount || !billNumber || !date || !selectedParty) { alert('Fill all purchase fields.'); return; }
    const baseAmt = asNumber(amount);
    if (baseAmt <= 0) { alert('Enter valid amount'); return; }
    const gst = baseAmt * 0.05, totalWithGst = Math.round(baseAmt + gst);
    await addDoc(collection(db, 'purchases'), {
      type: 'purchase', amount: totalWithGst, gstAmount: gst, baseAmount: baseAmt,
      party: selectedParty, billNumber, date
    });
    clearFormFields();
  };

  const handleAddPayment = async () => {
    const { payment, paymentMethod, date, checkNumber } = form;
    const amountToPay = asNumber(payment);
    if (!payment || !paymentMethod || !date || !selectedParty) { alert('Fill all payment fields.'); return; }
    const owes = filteredTransactions.reduce((t, tx) => {
      if (tx.type === 'purchase') return t + asNumber(tx.amount);
      if (tx.type === 'payment' || tx.type === 'return') return t - asNumber(tx.amount);
      return t;
    }, 0);
    if (owes <= 0) { alert('No outstanding balance.'); return; }
    if (amountToPay > owes) { alert(`Cannot pay more than owed. Owes ₹${(owes || 0).toFixed(2)}.`); return; }
    if (paymentMethod !== 'Cash' && bankBalance < amountToPay) { alert('Not Enough Money in the Bank'); return; }

    await addDoc(collection(db, 'payments'), {
      type: 'payment', amount: amountToPay, method: paymentMethod,
      party: selectedParty, date, checkNumber: paymentMethod === 'Check' ? checkNumber : null
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
      comment: tx.comment || ''
    });
  };

  const handleEditSave = async () => {
    const tx = editingTransaction;
    if (!editForm.amount || !editForm.date) { alert('Fill all required fields.'); return; }
    
    const coll = tx.type === 'purchase' ? 'purchases' : tx.type === 'payment' ? 'payments' : 'returns';
    let newData = { ...tx, ...editForm };
    
    if (tx.type === 'purchase') {
      const baseAmt = asNumber(editForm.amount);
      const gst = baseAmt * 0.05;
      const totalWithGst = Math.round(baseAmt + gst);
      
      newData = {
        ...newData,
        baseAmount: baseAmt,
        gstAmount: gst,
        amount: totalWithGst
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

  const handleEditCancel = () => { setEditingTransaction(null); setEditForm({}); };

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
      <div className='transaction-table-wrapper'>
        <table className='transaction-table'>
          <thead>
            <tr>
              <th>Date</th>
              <th>Party</th>
              <th>Type</th>
              <th>Bill No</th>
              <th>Method</th>
              <th>Check No</th>
              <th>Amount</th>
              <th>GST</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
              <th>Edit</th>
              <th>See Comment</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx, i) => {
              const debit = tx.type === 'purchase' ? asNumber(tx.amount) : null;
              const credit = (tx.type === 'payment' || tx.type === 'return') ? asNumber(tx.amount) : null;
              const gst = tx.type === 'purchase'
                ? '₹' + (tx.gstAmount !== undefined
                  ? Number(tx.gstAmount).toFixed(2)
                  : ((asNumber(tx.amount) / 1.05) * 0.05).toFixed(2))
                : '-';
              return (
                <tr key={tx.id || i}>
                  <td>{formatDate(tx.date)}</td>
                  <td>{tx.party}</td>
                  <td>{tx.type}</td>
                  <td>{tx.billNumber || '-'}</td>
                  <td>{tx.method || '-'}</td>
                  <td>{tx.method === 'Check' && tx.checkNumber ? tx.checkNumber : '-'}</td>
                  <td>₹{asNumber(tx.amount).toFixed(2)}</td>
                  <td>{gst}</td>
                  <td>{debit !== null ? `₹${asNumber(debit).toFixed(2)}` : '-'}</td>
                  <td>{credit !== null ? `₹${asNumber(credit).toFixed(2)}` : '-'}</td>
                  <td>₹{runningBalances[tx.id] !== undefined ? asNumber(runningBalances[tx.id]).toFixed(2) : '-'}</td>
                  <td><button onClick={() => onEdit && onEdit(tx)}>Edit</button></td>
                  <td>{tx.comment ? <button onClick={() => onSeeComment && onSeeComment(tx)}>See Comment</button> : ''}</td>
                  <td><button onClick={() => onDelete && onDelete(tx)} style={{ color: 'white', background: '#d9534f' }}>Delete</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const SectionHistory = ({ type, party }) => {
    const sectionTx = (
      type === 'purchase' ? purchaseTransactions :
      type === 'payment' ? paymentTransactions : returnTransactions
    ).filter(tx => tx.party === party)
     .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sectionTx.length === 0) return <div style={{ marginTop: 12, color: '#888' }}>No {type}s for this party.</div>;
    return (
      <div style={{ marginTop: 18 }}>
        <h4>Recent {type.charAt(0).toUpperCase() + type.slice(1)} History</h4>
        <TransactionTable
          transactions={sectionTx.slice(0, 6)}
          onEdit={handleEditClick}
          onSeeComment={setCommentTxModal}
          onDelete={handleDeleteTransaction}
        />
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
    const headers = ['Date', 'Party', 'Amount', 'GST', 'Bill No', 'Comment'];
    const data = filtered.map(tx => [
      formatDate(tx.date),
      tx.party,
      `₹${asNumber(tx.amount).toFixed(2)}`,
      `₹${(tx.gstAmount || 0).toFixed(2)}`,
      tx.billNumber || '-',
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

    const allTxRows = [['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Check No', 'Comment']];
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
          tx.comment || ''
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

  return (
    <div className='home-page'>
      <div className='sidebar'>
        <h1 className='nrv-logo'>NRV</h1>
        {['home', 'purchase', 'pay', 'return', 'balance', 'party', 'bank', 'salary'].map(btn => (
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
            <label>Amount{editingTransaction.type === 'purchase' ? ' (before GST)' : ''}: 
              <input type='number' value={editForm.amount || ''} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
            </label>
            {editingTransaction.type === 'purchase' && editForm.amount && !isNaN(asNumber(editForm.amount)) && (
              <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                <div>GST (5%): ₹{(asNumber(editForm.amount) * 0.05).toFixed(2)}</div>
                <div>Total after GST: ₹{Math.round(asNumber(editForm.amount) * 1.05)}</div>
              </div>
            )}
            <label>Bill No: <input type='text' value={editForm.billNumber || ''} onChange={e => setEditForm(f => ({ ...f, billNumber: e.target.value }))} /></label>
            <label>Method: <input type='text' value={editForm.method || ''} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} /></label>
            {editForm.method === 'Check' && (
              <label>Check #: <input type='text' value={editForm.checkNumber || ''} onChange={e => setEditForm(f => ({ ...f, checkNumber: e.target.value }))} /></label>
            )}
            {editingTransaction.type === 'return' && (
              <label>Comment: <textarea value={editForm.comment || ''} onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))} /></label>
            )}
            <div style={{ marginTop: 8 }}>
              <button onClick={handleEditSave}>Save</button>
              <button onClick={() => { setEditingTransaction(null); setEditForm({}); }}>Cancel</button>
            </div>
          </div>
        )}

        {commentTxModal && <CommentModal tx={commentTxModal} onClose={() => setCommentTxModal(null)} />}

        {view === 'home' && (
          <>
            <h1>NANDKUMAR RAMACHANDRA VELHAL</h1>
            <h3>Total Owed to All Parties: ₹{(totalOwed || 0).toFixed(2)}</h3>
            <h4>
              All Transactions <br />
              <span style={{ fontWeight: 'normal' }}>
                Total GST on Purchases: ₹
                {allTransactions.filter(tx => tx.type === 'purchase').reduce((s, tx) => s + (Number(tx.gstAmount) || 0), 0).toFixed(2)}
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
            <button className='addPurchase-button' onClick={handleAddPurchase}>Add Purchase</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            {form.amount && !isNaN(asNumber(form.amount)) && (
              <div style={{ marginTop: 10 }}>
                <p>GST (5%): ₹{(asNumber(form.amount) * 0.05).toFixed(2)}</p>
                <p>Total after GST: ₹{Math.round(asNumber(form.amount) * 1.05)}</p>
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
            
            {selectedParty && <SectionHistory type='purchase' party={selectedParty} />}
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
            
            {selectedParty && <SectionHistory type='payment' party={selectedParty} />}
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
            
            {selectedParty && <SectionHistory type='return' party={selectedParty} />}
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
              {filteredTransactions.filter(tx => tx.type === 'purchase').reduce((s, tx) => s + (Number(tx.gstAmount) || 0), 0).toFixed(2)}
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
            <PartyInfoTable parties={partiesInfo} />
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
            <table className='transaction-table'>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Method</th>
                  <th>Check No.</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                  <th>Delete</th>
                </tr>
              </thead>
              <tbody>
                {bankFilteredLedger.map((e, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(e.date)}</td>
                    <td>{e.party}</td>
                    <td>{e.method}</td>
                    <td>{e.checkNumber || '-'}</td>
                    <td style={{ color: e.debit ? 'red' : 'black' }}>{e.debit ? `₹${e.debit.toFixed(2)}` : '-'}</td>
                    <td style={{ color: e.credit ? 'green' : 'black' }}>{e.credit ? `₹${e.credit.toFixed(2)}` : '-'}</td>
                    <td>₹{e.balance.toFixed(2)}</td>
                    <td>
                      {e.type === 'deposit' && e.source === 'bankDeposits' && e.isPaymentDeduction !== true
                        ? <button onClick={() => handleDeleteBankEntry(e)} style={{ color: 'white', background: '#d9534f' }}>Delete</button>
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'salary' && (
          <div className='form-container'>
            <h2>Salary Payment</h2>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
