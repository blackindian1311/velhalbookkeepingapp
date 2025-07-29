import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from "./firebase";
import { collection, addDoc, updateDoc, doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";



// Helper for numbers
const asNumber = v => Number(typeof v === "string" ? v.replace(/,/g, "") : v) || 0;


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
          <div><strong>Date:</strong> {tx.date}</div>
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

  // FIXED BANK LEDGER: properly handles deposits and payments without duplication
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

  // Filtered bank ledger
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

  // Download functions for each section
  const downloadAllTransactions = (format) => {
    const headers = ['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Check No', 'Comment'];
    const data = homeFilteredTransactions.map(tx => [
      tx.date,
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
      tx.date,
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
      tx.date,
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
      tx.date,
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
      tx.date,
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
      entry.date,
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

  // Date filter component
  const DateFilter = ({ startDate, setStartDate, endDate, setEndDate, label }) => (
    <div style={{ margin: '10px 0', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
      <h4>{label} Date Filter:</h4>
      <label>From: 
        <input 
          type="date" 
          value={startDate} 
          onChange={e => setStartDate(e.target.value)}
          style={{ marginLeft: '5px', marginRight: '15px' }}
        />
      </label>
      <label>To: 
        <input 
          type="date" 
          value={endDate} 
          onChange={e => setEndDate(e.target.value)}
          style={{ marginLeft: '5px' }}
        />
      </label>
    </div>
  );

  // Download buttons component
  const DownloadButtons = ({ onDownloadCSV, onDownloadPDF }) => (
    <div style={{ margin: '10px 0' }}>
      <button onClick={() => onDownloadCSV('csv')} style={{ marginRight: '10px', padding: '8px 16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}>
        Download CSV
      </button>
      <button onClick={() => onDownloadPDF('pdf')} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>
        Download PDF
      </button>
    </div>
  );

  const handleAddParty = async () => {
    const f = partyInput;
    if (f.businessName && f.phoneNumber && f.bankNumber && f.contactName && f.contactMobile && f.bankName) {
      const newParty = { ...f };
      await addDoc(collection(db, "parties"), newParty);
      setPartyInput({
        businessName: '', phoneNumber: '', bankNumber: '', contactName: '', contactMobile: '', bankName: ''
      });
      setShowPartyForm(false);
    } else alert('Please fill all fields.');
  };

  const handleAddPurchase = async () => {
    const { amount, billNumber, date } = form;
    if (!amount || !billNumber || !date || !selectedParty) {
      alert('Fill all purchase fields.'); return;
    }
    const baseAmt = asNumber(amount);
    if (baseAmt <= 0) { alert("Enter valid amount"); return; }
    const gst = baseAmt * 0.05, totalWithGst = Math.round(baseAmt + gst);
    const newPurchase = {
      type: 'purchase', amount: totalWithGst, gstAmount: gst, baseAmount: baseAmt,
      party: selectedParty, billNumber, date,
    };
    await addDoc(collection(db, "purchases"), newPurchase);
    clearFormFields();
  };

  const handleAddPayment = async () => {
    const { payment, paymentMethod, date, checkNumber } = form;
    const amountToPay = asNumber(payment);

    if (!payment || !paymentMethod || !date || !selectedParty) {
      alert('Fill all payment fields.'); return;
    }
    if (totalOwed <= 0) { alert("No outstanding balance."); return; }
    if (amountToPay > totalOwed) {
      alert(`Cannot pay more than owed. Owes ₹${(totalOwed || 0).toFixed(2)}.`); return;
    }
    if (paymentMethod !== 'Cash' && bankBalance < amountToPay) {
      alert('Not Enough Money in the Bank'); return;
    }

    const newPayment = {
      type: 'payment', amount: amountToPay,
      method: paymentMethod, party: selectedParty, date,
      checkNumber: paymentMethod === 'Check' ? checkNumber : null
    };

    await addDoc(collection(db, "payments"), newPayment);
    
    if (paymentMethod !== 'Cash') {
      const updatedBalance = bankBalance - amountToPay;
      await setDoc(doc(db, "meta", "bank"), { balance: updatedBalance });
      
      await addDoc(collection(db, "bankDeposits"), {
        amount: -amountToPay,
        date,
        party: selectedParty,
        isPaymentDeduction: true,
        paymentMethod: paymentMethod
      });
    }
    clearFormFields();
  };

  const handleAddReturn = async () => {
    const { returnAmount, returnDate, billNumber, comment } = form;
    if (!returnAmount || !returnDate || !selectedParty) {
      alert('Fill all return fields.'); return;
    }
    if (!comment.trim()) { alert('Please provide a comment for the return.'); return; }
    const newReturn = {
      type: 'return',
      amount: asNumber(returnAmount),
      party: selectedParty,
      date: returnDate,
      billNumber: billNumber || null,
      comment
    };
    await addDoc(collection(db, "returns"), newReturn);
    clearFormFields();
  };

  const handleDeposit = async () => {
    const amount = asNumber(depositAmount);
    const dateToUse = depositDate || new Date().toISOString();
    if (amount > 0) {
      const updated = bankBalance + amount;
      await setDoc(doc(db, "meta", "bank"), { balance: updated });
      await addDoc(collection(db, "bankDeposits"), {
        amount,
        date: dateToUse,
        isPaymentDeduction: false
      });
      setDepositAmount('');
      setDepositDate('');
    } else alert('Please enter a valid number');
  };

  const handleEditClick = (tx) => {
    setEditingTransaction(tx);
    setEditForm({
      ...tx,
      amount: asNumber(tx.amount),
      billNumber: tx.billNumber || "",
      checkNumber: tx.checkNumber || "",
      method: tx.method || "",
      date: tx.date || "",
      party: tx.party || "",
      comment: tx.comment || ""
    });
  };

  const handleEditSave = async () => {
    const tx = editingTransaction;
    if (!editForm.amount || !editForm.date) {
      alert("Fill all required fields."); return;
    }
    let coll = tx.type === "purchase" ? "purchases" : tx.type === "payment" ? "payments" : "returns";
    let newData = { ...tx, ...editForm, amount: asNumber(editForm.amount), billNumber: editForm.billNumber || null, comment: editForm.comment || "" };
    await updateDoc(doc(db, coll, tx.id), newData);
    setEditingTransaction(null); setEditForm({});
  };
  const handleEditCancel = () => { setEditingTransaction(null); setEditForm({}); };

  const TransactionTable = ({ transactions, onEdit, onSeeComment }) => {
    const txs = transactions.slice().sort((a, b) => new Date(b.date) - new Date(a.date)); // FIXED: was a,b.date
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
                  <td>{tx.date}</td>
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

  const SectionHistory = ({ type, party }) => {
    let sectionTx = (
      type === "purchase" ? purchaseTransactions :
      type === "payment" ? paymentTransactions : returnTransactions
    ).filter(tx => tx.party === party);

    // Apply date filter based on type
    if (type === "purchase") {
      sectionTx = filterTransactionsByDate(sectionTx, purchaseFilterStart, purchaseFilterEnd);
    } else if (type === "payment") {
      sectionTx = filterTransactionsByDate(sectionTx, paymentFilterStart, paymentFilterEnd);
    } else if (type === "return") {
      sectionTx = filterTransactionsByDate(sectionTx, returnFilterStart, returnFilterEnd);
    }

    sectionTx = sectionTx.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sectionTx.length === 0)
      return <div style={{marginTop:12,color:'#888'}}>No {type}s for this party.</div>;
    return (
      <div style={{marginTop:18}}>
        <h4>Recent {type.charAt(0).toUpperCase()+type.slice(1)} History</h4>
        <TransactionTable transactions={sectionTx.slice(0,6)} onEdit={handleEditClick} onSeeComment={setCommentTxModal} />
      </div>
    );
  };

  const exportAllData = () => {
    const from = new Date(exportStartDate);
    const to = new Date(exportEndDate);
    to.setHours(23, 59, 59, 999);

    const allTxRows = [
      ['Date', 'Party', 'Type', 'Amount', 'GST', 'Method', 'Bill No', 'Check No', 'Comment']
    ];
    allTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      if (txDate >= from && txDate <= to) {
        allTxRows.push([
          tx.date,
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

    const partyRows = [
      ['Business', 'Phone', 'Bank', 'Bank Name', 'Contact', 'Mobile']
    ];
    partiesInfo.forEach(p => {
      partyRows.push([
        p.businessName,
        p.phoneNumber,
        p.bankNumber,
        p.bankName,
        p.contactName,
        p.contactMobile
      ]);
    });

    const bankRows = [
      ['Date', 'Party', 'Method', 'Check No.', 'Debit', 'Credit', 'Balance']
    ];
    getBankLedger().forEach(entry => {
      const entryDate = new Date(entry.date);
      if (entryDate >= from && entryDate <= to) {
        bankRows.push([
          entry.date,
          entry.party,
          entry.method,
          entry.checkNumber || '-',
          entry.debit || '',
          entry.credit || '',
          entry.balance || ''
        ]);
      }
    });

    downloadCSV('transactions_filtered.csv', allTxRows);
    downloadCSV('parties.csv', partyRows);
    downloadCSV('bank_ledger_filtered.csv', bankRows);
  };

  const exportPDF = () => {
    const from = new Date(exportStartDate);
    const to = new Date(exportEndDate);
    to.setHours(23, 59, 59, 999);

    const doc = new jsPDF();
    doc.text("Velhal Bookkeeping Summary", 14, 15);

    const txRows = allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= from && txDate <= to;
    }).map(tx => [
      tx.date,
      tx.party,
      tx.type,
      asNumber(tx.amount),
      tx.method || '',
      tx.billNumber || '',
      tx.checkNumber || ''
    ]);

    autoTable(doc, {
      startY: 20,
      head: [["Date", "Party", "Type", "Amount", "Method", "Bill No", "Check No"]],
      body: txRows,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save("velhal_summary.pdf");
  };
  
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
        {/* Edit modal */}
        {editingTransaction && (
          <div className="modal">
            <h3>Edit Transaction</h3>
            <label>Date: <input type="date" value={editForm.date || ''} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} /></label>
            <label>Party:
              <select value={editForm.party || ''}
                onChange={e => setEditForm(f => ({ ...f, party: e.target.value }))}
              >{partiesInfo.map((p, idx) =>
                  <option key={idx} value={p.businessName}>{p.businessName}</option>)}
              </select>
            </label>
            <label>Type: {editingTransaction.type}</label>
            <label>Amount: <input type="number" value={editForm.amount || ''} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} /></label>
            <label>Bill No: <input type="text" value={editForm.billNumber || ''} onChange={e => setEditForm(f => ({ ...f, billNumber: e.target.value }))} /></label>
            <label>Method: <input type="text" value={editForm.method || ''} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} /></label>
            {editForm.method === "Check" &&
              (<label>Check #: <input type="text" value={editForm.checkNumber || ''} onChange={e => setEditForm(f => ({ ...f, checkNumber: e.target.value }))} /></label>)
            }
            {editingTransaction.type === "return" && (
              <label>
                Comment: <textarea value={editForm.comment || ""} onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))} />
              </label>
            )}
            <div style={{ marginTop: "8px" }}>
              <button onClick={handleEditSave}>Save</button>
              <button onClick={handleEditCancel}>Cancel</button>
            </div>
          </div>
        )}
        {/* See Comment Modal */}
        {commentTxModal && <CommentModal tx={commentTxModal} onClose={() => setCommentTxModal(null)} />}

        {view === 'home' && (
          <>
            <h1>NANDKUMAR RAMACHANDRA VELHAL</h1>
            <h3>Total Owed to All Parties: ₹{(totalOwed || 0).toFixed(2)}</h3>
            <h4>
              All Transactions <br />
              <span style={{fontWeight: 'normal'}}>
                Total GST on Purchases: ₹
                {
                  homeFilteredTransactions.filter(tx => tx.type === 'purchase')
                    .reduce((sum, tx) => sum + (Number(tx.gstAmount) || 0), 0)
                    .toFixed(2)
                }
              </span>
            </h4>
            
            <DateFilter 
              startDate={homeFilterStart}
              setStartDate={setHomeFilterStart}
              endDate={homeFilterEnd}
              setEndDate={setHomeFilterEnd}
              label="All Transactions"
            />
            
            <DownloadButtons 
              onDownloadCSV={() => downloadAllTransactions('csv')}
              onDownloadPDF={() => downloadAllTransactions('pdf')}
            />

            <label>From: <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} /></label>
            <label style={{ marginLeft: '12px' }}>To: <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} /></label>
            <button onClick={exportAllData} style={{ marginLeft: '12px' }}>Export All (CSV)</button>
            <button onClick={exportPDF} style={{ marginLeft: '6px' }}>Export All (PDF)</button>
            
            <TransactionTable transactions={homeFilteredTransactions} onEdit={handleEditClick} onSeeComment={setCommentTxModal}/>
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
            <button className='addPurchase-button' onClick={handleAddPurchase}>Add Purchase</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            {form.amount && !isNaN(asNumber(form.amount)) && (
              <div style={{ marginTop: '10px' }}>
                <p>GST (5%): ₹{(asNumber(form.amount) * 0.05).toFixed(2)}</p>
                <p>Total after GST: ₹{Math.round(asNumber(form.amount) * 1.05)}</p>
              </div>
            )}
            
            <DateFilter 
              startDate={purchaseFilterStart}
              setStartDate={setPurchaseFilterStart}
              endDate={purchaseFilterEnd}
              setEndDate={setPurchaseFilterEnd}
              label="Purchase History"
            />
            
            <DownloadButtons 
              onDownloadCSV={() => downloadPurchaseHistory('csv')}
              onDownloadPDF={() => downloadPurchaseHistory('pdf')}
            />
            
            {selectedParty && (
              <SectionHistory type="purchase" party={selectedParty} />
            )}
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
              <input
                type="text"
                placeholder="Enter Check Number"
                value={form.checkNumber || ''}
                onChange={e => setForm({ ...form, checkNumber: e.target.value })}
              />
            )}
            <button className='addPurchase-button' onClick={handleAddPayment}>Add Payment</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            
            <DateFilter 
              startDate={paymentFilterStart}
              setStartDate={setPaymentFilterStart}
              endDate={paymentFilterEnd}
              setEndDate={setPaymentFilterEnd}
              label="Payment History"
            />
            
            <DownloadButtons 
              onDownloadCSV={() => downloadPaymentHistory('csv')}
              onDownloadPDF={() => downloadPaymentHistory('pdf')}
            />
            
            {selectedParty && (
              <SectionHistory type="payment" party={selectedParty} />
            )}
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
            <textarea placeholder="Why was the product returned?" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} style={{width:'100%',minHeight:36,marginTop:8}} />
            <button className='addPurchase-button' onClick={handleAddReturn}>Add Return</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            
            <DateFilter 
              startDate={returnFilterStart}
              setStartDate={setReturnFilterStart}
              endDate={returnFilterEnd}
              setEndDate={setReturnFilterEnd}
              label="Return History"
            />
            
            <DownloadButtons 
              onDownloadCSV={() => downloadReturnHistory('csv')}
              onDownloadPDF={() => downloadReturnHistory('pdf')}
            />
            
            {selectedParty && (
              <SectionHistory type="return" party={selectedParty} />
            )}
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
            <p>
              Total GST on Purchases: ₹
              {
                balanceFilteredTransactions.filter(tx => tx.type === 'purchase')
                  .reduce((sum, tx) => sum + (Number(tx.gstAmount) || 0), 0)
                  .toFixed(2)
              }
            </p>
            
            <DateFilter 
              startDate={balanceFilterStart}
              setStartDate={setBalanceFilterStart}
              endDate={balanceFilterEnd}
              setEndDate={setBalanceFilterEnd}
              label="Balance History"
            />
            
            <DownloadButtons 
              onDownloadCSV={() => downloadBalanceHistory('csv')}
              onDownloadPDF={() => downloadBalanceHistory('pdf')}
            />
            
            <TransactionTable transactions={balanceFilteredTransactions} onEdit={handleEditClick} onSeeComment={setCommentTxModal} />
          </div>
        )}

        {view === 'party' && (
          <div className='form-container'>
            <h2>All Parties</h2>
            <PartyInfoTable parties={partiesInfo} />
            <button
              className="addPurchase-button"
              onClick={() => setShowPartyForm(s => !s)}
              style={{ margin: '18px 0 16px 0' }}>
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
          </div>
        )}

        {view === 'bank' && (
          <div className="form-container">
            <h2>Bank Balance: ₹{(bankBalance || 0).toFixed(2)}</h2>
            <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Enter deposit amount" />
            <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} placeholder="Enter deposit date" />
            <button onClick={handleDeposit} className="addPurchase-button">Deposit</button>
            
            <DateFilter 
              startDate={bankFilterStart}
              setStartDate={setBankFilterStart}
              endDate={bankFilterEnd}
              setEndDate={setBankFilterEnd}
              label="Bank Transaction History"
            />
            
            <DownloadButtons 
              onDownloadCSV={() => downloadBankHistory('csv')}
              onDownloadPDF={() => downloadBankHistory('pdf')}
            />
            
            <h2 style={{ marginTop: '20px' }}>Bank Transaction History</h2>
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
                {filteredBankLedger.map((entry, idx) => (
                  <tr key={idx}>
                    <td>{new Date(entry.date).toLocaleString()}</td>
                    <td>{entry.party}</td>
                    <td>{entry.method}</td>
                    <td>{entry.checkNumber || '-'}</td>
                    <td style={{ color: entry.debit ? 'red' : 'black' }}>
                      {entry.debit ? `₹${entry.debit.toFixed(2)}` : '-'}
                    </td>
                    <td style={{ color: entry.credit ? 'green' : 'black' }}>
                      {entry.credit ? `₹${entry.credit.toFixed(2)}` : '-'}
                    </td>
                    <td>₹{entry.balance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'salary' && (
          <div className='form-container'>
            <h2>Salary Payment</h2>
            {/* Add your salary implementation here */}
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
