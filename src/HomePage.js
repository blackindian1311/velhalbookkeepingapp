import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from "./firebase";
import { collection, addDoc, updateDoc, doc, setDoc, onSnapshot } from "firebase/firestore";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper for numbers
const asNumber = v => Number(typeof v === "string" ? v.replace(/,/g, "") : v) || 0;

// Helper for date formatting DD/MM/YYYY
const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2,'0');
  const month = String(date.getMonth() + 1).padStart(2,'0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const PartyInfoTable = ({ parties = [] }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsPerPage = 7;

  const filtered = parties
    .filter(p =>
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
        type="text"
        value={search}
        placeholder="Search party..."
        onChange={e=>{setSearch(e.target.value); setPage(1);}}
        style={{ marginBottom: '10px', padding: '5px', width: '100%' }}
      />
      <div style={{overflowX:'auto'}}>
        <table className="transaction-table">
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
              <tr>
                <td colSpan={6} style={{textAlign:'center', color:'#888'}}>No parties found.</td>
              </tr>
            )}
            {shown.map((p, i) =>
              <tr key={i}>
                <td>{p.businessName}</td>
                <td>{p.phoneNumber}</td>
                <td>{p.bankNumber}</td>
                <td>{p.bankName}</td>
                <td>{p.contactName}</td>
                <td>{p.contactMobile}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:8,textAlign:'center'}}>
        Page {page}/{totalPages || 1}
        <br />
        <button disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button>
        <button disabled={page>=totalPages} onClick={()=>setPage(page+1)} style={{marginLeft:8}}>Next</button>
      </div>
    </div>
  );
};

function CommentModal({ tx, onClose }) {
  if (!tx) return null;
  return (
    <div className="modal">
      <div style={{maxWidth:400, minWidth:300, margin:'auto', border:'1px solid #bbb', borderRadius:6, background:'#fff', padding:20}}>
        <h3>Transaction Details</h3>
        <div style={{marginBottom: 12}}>
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
          <div style={{marginTop:3, fontStyle: 'italic', color: '#222'}}>
            {tx.comment || <span style={{color:'#999'}}>No comment provided.</span>}
          </div>
        </div>
        <button onClick={onClose} style={{marginTop:15}}>Close</button>
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

  // Date filter states for each view
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

  // Export date range
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Real-time listeners for all main Firestore collections
  useEffect(() => {
    const partySnap = onSnapshot(collection(db, "parties"), snapshot => {
      setPartiesInfo(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubPurch = onSnapshot(collection(db, "purchases"), snap => {
      setPurchaseTransactions(snap.docs.map(doc => ({ id: doc.id, type: 'purchase', ...doc.data() })));
    });
    const unsubPay = onSnapshot(collection(db, "payments"), snap => {
      setPaymentTransactions(snap.docs.map(doc => ({ id: doc.id, type: 'payment', ...doc.data() })));
    });
    const unsubRet = onSnapshot(collection(db, "returns"), snap => {
      setReturnTransactions(snap.docs.map(doc => ({ id: doc.id, type: 'return', ...doc.data() })));
    });
    const unsubDeposits = onSnapshot(collection(db, "bankDeposits"), snap => {
      setBankDeposits(snap.docs.map(doc => ({ ...doc.data() })));
    });
    
    const unsubBankBalance = onSnapshot(doc(db, "meta", "bank"), (docSnap) => {
      if (docSnap.exists()) {
        setBankBalance(docSnap.data().balance || 0);
      } else {
        setBankBalance(0);
      }
    });

    return () => {
      partySnap();
      unsubPurch();
      unsubPay();
      unsubRet();
      unsubDeposits();
      unsubBankBalance();
    };
  }, []);

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

  // All transactions (descending date order)
  const allTransactions = [
    ...purchaseTransactions, ...paymentTransactions, ...returnTransactions
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Filtered transactions for home view
  const homeFilteredTransactions = filterTransactionsByDate(allTransactions, homeFilterStart, homeFilterEnd);

  const filteredTransactions = selectedParty
    ? allTransactions.filter(tx => tx.party === selectedParty)
    : allTransactions;

  // Balance filtered transactions
  const balanceFilteredTransactions = filterTransactionsByDate(filteredTransactions, balanceFilterStart, balanceFilterEnd);

  const totalOwed = balanceFilteredTransactions.reduce((total, tx) => {
    if (tx.type === 'purchase') return total + asNumber(tx.amount);
    if (tx.type === 'payment' || tx.type === 'return') return total - asNumber(tx.amount);
    return total;
  }, 0);

  // BANK LEDGER: combined and descending date order
  const getBankLedger = () => {
    let ledger = [];
    bankDeposits.forEach(d => {
      if (d.isPaymentDeduction !== true) {
        ledger.push({
          date: d.date,
          party: d.party || '-',
          method: 'Deposit',
          checkNumber: '-',
          debit: d.amount < 0 ? Math.abs(asNumber(d.amount)) : null,
          credit: d.amount > 0 ? asNumber(d.amount) : null,
          type: 'deposit'
        });
      }
    });
    paymentTransactions.forEach(p => {
      if (p.method === "NEFT" || p.method === "Check") {
        ledger.push({
          date: p.date,
          party: p.party,
          method: p.method,
          checkNumber: p.checkNumber || '-',
          debit: asNumber(p.amount),
          credit: null,
          type: "payment"
        });
      }
    });
    ledger.sort((a, b) => new Date(b.date) - new Date(a.date));
    let asc = ledger.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    let balance = 0;
    const ledgerWithBalance = asc.map(entry => {
      if (entry.credit) balance += entry.credit;
      if (entry.debit) balance -= entry.debit;
      return { ...entry, balance };
    });
    return ledgerWithBalance.reverse();
  };
  const filteredBankLedger = filterTransactionsByDate(getBankLedger(), bankFilterStart, bankFilterEnd);

  const clearFormFields = () => setForm({
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

  // Download CSV helper
  const downloadCSV = (filename, rows) => {
    const csvContent = rows.map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download PDF helper
  const downloadPDF = (filename, title, data, headers) => {
    const doc = new jsPDF();
    doc.text(title, 14, 15);
    autoTable(doc, {
      startY: 25,
      head: [headers],
      body: data,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] }
    });
    doc.save(filename);
  };

  // Download functions for each section (DATE FORMAT APPLIED IN EVERY ROW)
  const downloadAllTransactions = (format) => {
    const headers = ['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Check No', 'Comment'];
    const data = homeFilteredTransactions.map(tx => [
      formatDate(tx.date),
      tx.party,
      tx.type,
      `₹${asNumber(tx.amount).toFixed(2)}`,
      tx.type === 'purchase' ? `₹${(tx.gstAmount || 0).toFixed(2)}` : '-',
      tx.method || '-',
      tx.billNumber || '-',
      tx.checkNumber || '-',
      tx.comment || '-'
    ]);
    if (format === 'csv') {
      downloadCSV('all_transactions.csv', [headers, ...data]);
    } else {
      downloadPDF('all_transactions.pdf', 'All Transactions Report', data, headers);
    }
  };

  const downloadPurchaseHistory = (format) => {
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
      downloadPDF('purchase_history.pdf', 'Purchase History Report', data, headers);
    }
  };

  const downloadPaymentHistory = (format) => {
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
      downloadPDF('payment_history.pdf', 'Payment History Report', data, headers);
    }
  };

  const downloadReturnHistory = (format) => {
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
      downloadPDF('return_history.pdf', 'Return History Report', data, headers);
    }
  };

  const downloadBalanceHistory = (format) => {
    const headers = ['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Comment'];
    const data = balanceFilteredTransactions.map(tx => [
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
      downloadPDF('balance_history.pdf', 'Balance History Report', data, headers);
    }
  };

  const downloadBankHistory = (format) => {
    const headers = ['Date', 'Party', 'Method', 'Check No', 'Debit', 'Credit', 'Balance'];
    const data = filteredBankLedger.map(entry => [
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
      downloadPDF('bank_history.pdf', 'Bank Transaction History', data, headers);
    }
  };

  // ... DateFilter, DownloadButtons, handleAddParty, handleAddPurchase, handleAddPayment, handleAddReturn, handleDeposit, handleEditClick, handleEditSave, handleEditCancel (same as your original, unchanged) ...

  // For brevity, code continues unchanged up to TransactionTable below

  const TransactionTable = ({ transactions, onEdit, onSeeComment }) => {
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
      <div className="transaction-table-wrapper">
        <table className="transaction-table">
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
            </tr>
          </thead>
          <tbody>
            {txs.map((tx, i) => {
              const party = tx.party || "";
              const debit = tx.type === 'purchase' ? asNumber(tx.amount) : null;
              const credit = (tx.type === 'payment' || tx.type === 'return') ? asNumber(tx.amount) : null;
              const gst = tx.type === 'purchase'
                ? '₹' + (tx.gstAmount !== undefined
                  ? Number(tx.gstAmount).toFixed(2)
                  : ((asNumber(tx.amount)/1.05)*0.05).toFixed(2))
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
                  <td><button onClick={() => onEdit ? onEdit(tx) : null}>Edit</button></td>
                  <td>{tx.comment ? (
                    <button onClick={() => onSeeComment && onSeeComment(tx)}>See Comment</button>
                  ) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ...rest of your code continues, always using formatDate for all <td>{tx.date}</td> or <td>{entry.date}</td> in every table...

  // YOUR REMAINING COMPONENTS: SectionHistory, DateFilter, DownloadButtons, and the HomePage return 
  // are unchanged except: in every transaction-related table, all dates use {formatDate(...)}.

  // Also, in other tables or PDF/CSV export: always use formatDate to convert any date for user output.

  // End
};

export default HomePage;
