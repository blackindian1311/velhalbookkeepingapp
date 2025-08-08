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

const HomePage = () => {
  // ... (your unchanged state and code) ...

  // Put your useEffect, handlers, SectionHistory, etc. here exactly as before.

  // For brevity, the rest is unchanged, just showing how you fix the date in bank ledger table:
  // In the bank view table:

  // ...inside HomePage's return, your bank view...
  // ...unchanged code before...
  {view === 'bank' && (
    <div className="form-container">
      <h2>Bank Balance: ₹{(bankBalance || 0).toFixed(2)}</h2>
      <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Enter deposit amount" />
      <input type="date" value={depositDate} onChange={e => setDepositDate(e.target.value)} placeholder="Enter deposit date" />
      <button onClick={handleDeposit} className="addPurchase-button">Deposit</button>
      {/* ...filters and buttons... */}
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
              <td>{formatDate(entry.date)}</td>
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
  // ...rest of your HomePage render code...
};
// ...export default HomePage and other components...
export default HomePage;