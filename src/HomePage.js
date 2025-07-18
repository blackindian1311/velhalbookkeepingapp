import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from "./firebase";
import { collection, addDoc, getDocs, updateDoc, doc, getDoc, setDoc } from "firebase/firestore";

// --- Helpers
const asNumber = v => Number(typeof v === "string" ? v.replace(/,/g, "") : v) || 0;
function exportTransactionsCSV(transactions) {
  const headers = [
    'Date','Party','Type','Bill No','Method','Check No','Amount','Debit','Credit','Balance','Comment'
  ];
  const rows = transactions.map(tx => [
    tx.date,
    tx.party,
    tx.type,
    tx.billNumber || '-',
    tx.method || '-',
    (tx.method === 'Check' ? tx.checkNumber : '-') || '-',
    asNumber(tx.amount).toFixed(2),
    tx.type === "purchase" ? asNumber(tx.amount).toFixed(2) : '',
    (tx.type === "payment" || tx.type === "return") ? asNumber(tx.amount).toFixed(2) : '',
    asNumber(tx.balance || 0).toFixed(2),
    tx.comment ? `"${tx.comment.replace(/"/g, '""')}"` : ""
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// === New: Comment Modal
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

// --- Main HomePage component ---
const HomePage = () => {
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [commentTxModal, setCommentTxModal] = useState(null); // for "see comment" button

  const [view, setView] = useState('home');
  const [bankBalance, setBankBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositDate, setDepositDate] = useState('');
  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [returnTransactions, setReturnTransactions] = useState([]);
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
  const [bankLedger, setBankLedger] = useState([]);
  const [depositHistory, setDepositHistory] = useState([]);

  // --- Utility ---
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

  useEffect(() => {
    const fetchParties = async () => {
      try {
        const snapshot = await getDocs(collection(db, "parties"));
        const parties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPartiesInfo(parties);
      } catch (error) { console.error('Error fetching parties from Firestore:', error); }
    };
    fetchParties();
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [snapP, snapPay, snapR, snapBD] = await Promise.all([
          getDocs(collection(db, "purchases")),
          getDocs(collection(db, "payments")),
          getDocs(collection(db, "returns")),
          getDocs(collection(db, "bankDeposits")),
        ]);
        const purchaseData = snapP.docs.map(doc => ({ id: doc.id, type: 'purchase', ...doc.data() }));
        const paymentData = snapPay.docs.map(doc => ({ id: doc.id, type: 'payment', ...doc.data() }));
        const returnData = snapR.docs.map(doc => ({ id: doc.id, type: 'return', ...doc.data() }));
        setPurchaseTransactions(purchaseData);
        setPaymentTransactions(paymentData);
        setReturnTransactions(returnData);

        // bank balance
        const bankDoc = doc(db, "meta", "bank");
        const bankSnap = await getDoc(bankDoc);
        if (bankSnap.exists()) { setBankBalance(bankSnap.data().balance); }
        else { await setDoc(bankDoc, { balance: 0 }); setBankBalance(0);}
        // Deposit ledger
        const deposits = snapBD.docs.map(doc => doc.data()).sort((a, b) => new Date(b.date) - new Date(a.date));
        setDepositHistory(deposits);
        // bank ledger
        const combined = [];
        deposits.forEach(d => {
          combined.push({
            date: d.date,
            party: '-',
            method: 'Deposit',
            checkNumber: '-',
            debit: null,
            credit: asNumber(d.amount),
            balance: null
          });
        });
        paymentData.forEach(p => {
          if(p.method !== 'Cash') {
            combined.push({
              date: p.date,
              party: p.party,
              method: p.method,
              checkNumber: p.checkNumber || '-',
              debit: asNumber(p.amount),
              credit: null,
              balance: null
            });
          }
        });
        combined.sort((a,b) => new Date(a.date) - new Date(b.date));
        let runBal = 0;
        const ledgerWithBal = combined.map(entry => {
          if (entry.credit) runBal += entry.credit;
          if (entry.debit) runBal -= entry.debit;
          return { ...entry, balance: runBal };
        });
        setBankLedger(ledgerWithBal.reverse());
      } catch(e) { console.error("Failed to fetch data:", e);}
    };
    fetchInitialData();
  }, []);

  // --- Utility: send data to Firestore, selecting correct collection based on type ---
  async function sendDataToSheet(data) {
    try {
      const coll = { party: "parties", purchase: "purchases", payment: "payments", return: "returns" }[data.type] || "unknown";
      if (coll === "unknown") throw new Error("Unknown data type");
      await addDoc(collection(db, coll), data);
    } catch (e) { console.error("Error saving data to Firestore:", e);}
  }

  // --- All transactions, total owed etc ---
  const allTransactions = [
    ...purchaseTransactions, ...paymentTransactions, ...returnTransactions
  ].sort((a,b) => new Date(a.date) - new Date(b.date));

  const filteredTransactions = selectedParty
    ? allTransactions.filter(tx => tx.party === selectedParty)
    : allTransactions;

  const totalOwed = filteredTransactions.reduce((total, tx) => {
    if (tx.type === 'purchase') return total + asNumber(tx.amount);
    if (tx.type === 'payment' || tx.type === 'return') return total - asNumber(tx.amount);
    return total;
  }, 0);

  // ------------------- Form Handlers ------------------

  // --- Add Party ---
  const handleAddParty = async () => {
    const f = partyInput;
    if (f.businessName && f.phoneNumber && f.bankNumber && f.contactName && f.contactMobile && f.bankName) {
      const newParty = { ...f };
      sendDataToSheet({ type: "party", ...newParty });
      setPartiesInfo(p => [...p, newParty]);
      setPartyInput({
        businessName: '', phoneNumber: '', bankNumber: '', contactName: '', contactMobile: '', bankName: ''
      });
      setShowPartyForm(false);
    } else alert('Please fill all fields.');
  };

  // --- Add Purchase ---
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
      party: selectedParty, billNumber, date
    };
    const docRef = await addDoc(collection(db, "purchases"), newPurchase);
    newPurchase.id = docRef.id;
    setPurchaseTransactions(p => [...p, newPurchase]);
    clearFormFields();
    sendDataToSheet({ type: "purchase", ...newPurchase });
  };

  // --- Add Payment ---
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
    const docRef = await addDoc(collection(db, "payments"), newPayment);
    newPayment.id = docRef.id;
    setPaymentTransactions(p => [...p, newPayment]);
    clearFormFields();

    if (paymentMethod !== 'Cash') {
      const updBal = bankBalance - amountToPay;
      setBankBalance(updBal);
      await setDoc(doc(db, "meta", "bank"), { balance: updBal });
      await addDoc(collection(db, "bankDeposits"), { amount: -amountToPay, date });
      setDepositHistory(prev => [{ amount: -amountToPay, date }, ...prev]);
    }

    sendDataToSheet({ type: "payment", ...newPayment });
  };

  // --- Add Return (WITH COMMENT) ---
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
      comment: comment
    };
    const docRef = await addDoc(collection(db, "returns"), newReturn);
    newReturn.id = docRef.id;
    setReturnTransactions(prev => [...prev, newReturn]);
    clearFormFields();
    sendDataToSheet({ type: "return", ...newReturn });
  };

  // --- Deposit Handler ---
  const handleDeposit = async () => {
    const amount = asNumber(depositAmount);
    const dateToUse = depositDate || new Date().toISOString();
    if (amount > 0) {
      const updated = bankBalance + amount;
      await setDoc(doc(db, "meta", "bank"), { balance: updated });
      await addDoc(collection(db, "bankDeposits"), { amount, date: dateToUse });
      setBankLedger(prev => {
        const latestBalance = prev.length > 0 ? prev[0].balance : 0;
        const newBalance = latestBalance + amount;
        const newEntry = {
          date: dateToUse, party: '-', method: 'Deposit', checkNumber: '-', debit: null,
          credit: amount, balance: newBalance
        };
        return [newEntry, ...prev];
      });
      const fresh = await getDoc(doc(db, "meta", "bank"));
      if (fresh.exists()) setBankBalance(fresh.data().balance);
      setDepositAmount(''); setDepositDate('');
      setDepositHistory(prev => [{ amount, date: dateToUse }, ...prev]);
    } else alert('Please enter a valid number');
  };

  // --- EDITING TRANSACTIONS --------

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
    if (tx.type === "purchase")
      setPurchaseTransactions(arr => arr.map(t => t.id === tx.id ? newData : t));
    if (tx.type === "payment")
      setPaymentTransactions(arr => arr.map(t => t.id === tx.id ? newData : t));
    if (tx.type === "return")
      setReturnTransactions(arr => arr.map(t => t.id === tx.id ? newData : t));
    setEditingTransaction(null); setEditForm({});
  };
  const handleEditCancel = () => { setEditingTransaction(null); setEditForm({}); };

  // --- Table with SEE COMMENT column ---
  const TransactionTable = ({ transactions, onEdit, onSeeComment }) => {
    const txs = transactions.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const partyBalances = {};
    return (
      <div className="transaction-table-wrapper">
        <button style={{ float: "right", margin: "6px" }} onClick={() => exportTransactionsCSV(txs)}>Export csv</button>
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
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
              <th>Edit</th>
              <th>See Comment</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((tx, i) => {
              const party = tx.party || ""; // add running balance by party
              if (!partyBalances[party]) partyBalances[party] = 0;
              const debit = tx.type === 'purchase' ? asNumber(tx.amount) : null;
              const credit = (tx.type === 'payment' || tx.type === 'return') ? asNumber(tx.amount) : null;
              partyBalances[party] += debit || 0;
              partyBalances[party] -= credit || 0;
              const currentBalance = partyBalances[party];
              return (
                <tr key={tx.id || i}>
                  <td>{tx.date}</td>
                  <td>{tx.party}</td>
                  <td>{tx.type}</td>
                  <td>{tx.billNumber || '-'}</td>
                  <td>{tx.method || '-'}</td>
                  <td>{tx.method === 'Check' && tx.checkNumber ? tx.checkNumber : '-'}</td>
                  <td>₹{asNumber(tx.amount).toFixed(2)}</td>
                  <td>{debit !== null ? `₹${asNumber(debit).toFixed(2)}` : '-'}</td>
                  <td>{credit !== null ? `₹${asNumber(credit).toFixed(2)}` : '-'}</td>
                  <td>₹{asNumber(currentBalance).toFixed(2)}</td>
                  <td><button onClick={() => onEdit ? onEdit(tx) : null}>Edit</button></td>
                  <td>{tx.comment || (tx.type === 'return' && !tx.comment) ? (
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

  // --- Transaction history per section ---
  const SectionHistory = ({ type, party }) => {
    const sectionTx = (
      type === "purchase" ? purchaseTransactions :
      type === "payment" ? paymentTransactions : returnTransactions
    )
    .filter(tx => tx.party === party)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sectionTx.length === 0) return <div style={{marginTop:12,color:'#888'}}>No {type}s for this party.</div>;
    return (
      <div style={{marginTop:18}}>
        <h4>Recent {type.charAt(0).toUpperCase()+type.slice(1)} History</h4>
        <TransactionTable transactions={sectionTx.slice(0,6)} onEdit={handleEditClick} onSeeComment={setCommentTxModal} />
      </div>
    );
  };

  // ====== UI rendering ======
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
            {/* Optional fields */}
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
            <h4>All Transactions</h4>
            <TransactionTable transactions={allTransactions} onEdit={handleEditClick} onSeeComment={setCommentTxModal}/>
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
            {/* Transaction history for this party's purchases */}
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
            {/* Transaction history for this party's payments */}
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
            {/* COMMENT BOX for reason */}
            <textarea placeholder="Why was the product returned?" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} style={{width:'100%',minHeight:36,marginTop:8}} />
            <button className='addPurchase-button' onClick={handleAddReturn}>Add Return</button>
            <button className='clearForm-button' onClick={clearFormFields} style={{ marginLeft: 12 }}>Clear</button>
            {/* Transaction history for this party's returns */}
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
            <TransactionTable transactions={filteredTransactions} onEdit={handleEditClick} onSeeComment={setCommentTxModal} />
          </div>
        )}

        {view === 'party' && (
          <div className='form-container'>
            <h2>All Parties</h2>
            {/* You can integrate party table as before */}
            <div>
              <input placeholder="Business" value={partyInput.businessName} onChange={e => setPartyInput({ ...partyInput, businessName: e.target.value })} />
              <input placeholder="Phone" value={partyInput.phoneNumber} onChange={e => setPartyInput({ ...partyInput, phoneNumber: e.target.value })} />
              <input placeholder="Bank" value={partyInput.bankNumber} onChange={e => setPartyInput({ ...partyInput, bankNumber: e.target.value })} />
              <input placeholder="Bank Name" value={partyInput.bankName} onChange={e => setPartyInput({ ...partyInput, bankName: e.target.value })} />
              <input placeholder="Contact" value={partyInput.contactName} onChange={e => setPartyInput({ ...partyInput, contactName: e.target.value })} />
              <input placeholder="Mobile" value={partyInput.contactMobile} onChange={e => setPartyInput({ ...partyInput, contactMobile: e.target.value })} />
              <button onClick={handleAddParty} className="addPurchase-button">Save Party</button>
            </div>
          </div>
        )}

        {view === 'bank' && (
          <div className="form-container">
            <h2>Bank Balance: ₹{(bankBalance || 0).toFixed(2)}</h2>
            <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Enter deposit amount" />
            <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} placeholder="Enter deposit date" />
            <button onClick={handleDeposit} className="addPurchase-button">Deposit</button>
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
                {bankLedger.map((entry, index) => (
                  <tr key={index}>
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
            {/* (Extend as desired) */}
          </div>
        )}

      </div>
    </div>
  );
};

export default HomePage;
