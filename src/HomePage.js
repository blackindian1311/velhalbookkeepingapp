import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from "./firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";

const HomePage = () => {
  async function sendDataToSheet(data) {
  try {
    const collectionName = {
      party: "parties",
      purchase: "purchases",
      payment: "payments",
      return: "returns"
    }[data.type] || "unknown";

    if (collectionName === "unknown") throw new Error("Unknown data type");

    await addDoc(collection(db, collectionName), data);
    console.log(`Data saved to ${collectionName} collection in Firestore`);
  } catch (error) {
    console.error("Error saving data to Firestore:", error);
  }
}

  const [view, setView] = useState('home');
  const [bankBalance, setBankBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState(''); // Input field
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [returnTransactions, setReturnTransactions] = useState([]);
  const [partiesInfo, setPartiesInfo] = useState([]);
  const [partyInput, setPartyInput] = useState({
    businessName: '',
    phoneNumber: '',
    bankNumber: '',
    contactName: '',
    contactMobile: '',
    bankName:''
  });
  const [selectedParty, setSelectedParty] = useState('');
  const [form, setForm] = useState({
    amount: '',
    billNumber: '',
    date: '',
    payment: '',
    paymentMethod: '',
    returnAmount: '',
    returnDate: ''
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);


  useEffect(() => {
  const fetchParties = async () => {
  try {
    const snapshot = await getDocs(collection(db, "parties"));
    const parties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setPartiesInfo(parties);
  } catch (error) {
    console.error('Error fetching parties from Firestore:', error);
  }
};


  fetchParties();
}, []);

  useEffect(() => {
  const handleMouseMove = (e) => {
    if (e.clientX < 20) {
      setSidebarVisible(true);
    } else if (e.clientX > 200) {
      setSidebarVisible(false);
    }
  };

  window.addEventListener('mousemove', handleMouseMove);
  return () => window.removeEventListener('mousemove', handleMouseMove);
}, []);
useEffect(() => {
  const fetchInitialData = async () => {
  try {
    const snapshot = await getDocs(collection(db, "purchases"));
    const purchaseData = snapshot.docs.map(doc => ({ id: doc.id, type: 'purchase', ...doc.data() }));

    const snapshot2 = await getDocs(collection(db, "payments"));
    const paymentData = snapshot2.docs.map(doc => ({ id: doc.id, type: 'payment', ...doc.data() }));

    const snapshot3 = await getDocs(collection(db, "returns"));
    const returnData = snapshot3.docs.map(doc => ({ id: doc.id, type: 'return', ...doc.data() }));

    setPurchaseTransactions(purchaseData);
    setPaymentTransactions(paymentData);
    setReturnTransactions(returnData);
  } catch (error) {
    console.error("Failed to fetch data from Firestore:", error);
  }
};


  fetchInitialData();
}, []);

  const allTransactions = [...purchaseTransactions, ...paymentTransactions, ...returnTransactions];
  const filteredTransactions = allTransactions.filter(tx => tx.party === selectedParty);
  const totalOwed = filteredTransactions.reduce((total, tx) => {
    if (tx.type === 'purchase') return total + tx.amount;
    if (tx.type === 'payment' || tx.type === 'return') return total - tx.amount;
    return total;
  }, 0);
  const totalOwedAll = allTransactions.reduce((total, tx) => {
  const amt = parseFloat(tx.amount || 0);
  if (tx.type === 'purchase') return total + amt;
  if (tx.type === 'payment' || tx.type === 'return') return total - amt;
  return total;
}, 0);


  const handleAddParty = async () => {
  const { businessName, phoneNumber, bankNumber, contactName, contactMobile, bankName } = partyInput;

  if (businessName && phoneNumber && bankNumber && contactName && contactMobile && bankName) {
    const newParty = {
      businessName,
      phoneNumber,
      bankNumber,
      contactName,
      contactMobile,
      bankName
    };

    const updatedParties = [...partiesInfo, newParty];
    setPartiesInfo(updatedParties);
    setPartyInput({
      businessName: '',
      phoneNumber: '',
      bankNumber: '',
      contactName: '',
      contactMobile: '',
      bankName: '',
    });

   
   sendDataToSheet({ type: "party", ...newParty });

  } else {
    alert('Please fill all fields.');
  }
};
  const calculateRunningBalance = (transactions, newTransaction) => {
    const all = [...transactions, newTransaction];
    all.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let balance = 0;
    for (const tx of all) {
      if (tx.type === 'purchase') balance += tx.amount;
      if (tx.type === 'payment' || tx.type === 'return') balance -= tx.amount;
      if (tx === newTransaction) break; // stop once we reach the new transaction
    }
    return balance;
  };
  const handleAddPurchase = async () => {
    const { amount, billNumber, date } = form;
    if (amount && billNumber && date && selectedParty) {
      const amt = parseFloat(amount);
      const gst = amt * 0.05;
      const totalWithGst = amt + gst;
  
      const newPurchase = {
        type: 'purchase',
          amount: totalWithGst,
        gstAmount: gst,
        baseAmount: amt,
        party: selectedParty,
        billNumber,
        date
      };
  
      const balance = calculateRunningBalance(
        allTransactions.filter(tx => tx.party === selectedParty),
        newPurchase
      );
      newPurchase.balance = balance;
  
      setPurchaseTransactions(prev => [...prev, newPurchase]);
      setForm(prev => ({ ...prev, amount: '', billNumber: '', date: '' }));
  
      const purchaseData = {
        date: newPurchase.date,
        party: newPurchase.party,
        billNumber: newPurchase.billNumber,
        baseAmount: newPurchase.baseAmount,
        gstAmount: newPurchase.gstAmount,
        totalAmount: newPurchase.amount,
        balance: newPurchase.balance
      };
      sendDataToSheet({ type: "purchase", ...purchaseData });

    } else {
      alert('Fill all purchase fields.');
    }
  };
  const handleAddPayment = async () => {
  const { payment, paymentMethod, date } = form;
  const amountToPay = parseFloat(payment);

  if (!payment || !paymentMethod || !date || !selectedParty) {
    alert('Fill all payment fields.');
    return;
  }

  // Check if party owes money
  if (totalOwed <= 0) {
    alert("This party has no outstanding balance.");
    return;
  }

  // Don't allow overpaying
  if (amountToPay > totalOwed) {
    alert(`Cannot pay more than owed. This party only owes ₹${totalOwed.toFixed(2)}.`);
    return;
  }

  // Check bank balance if payment is not Cash
  if (paymentMethod !== 'Cash' && bankBalance < amountToPay) {
    alert('Not Enough Money in the Bank');
    return;
  }

  const newPayment = {
    type: 'payment',
    amount: amountToPay,
    method: paymentMethod,
    party: selectedParty,
    date
  };

  const balance = calculateRunningBalance(
    allTransactions.filter(tx => tx.party === selectedParty),
    newPayment
  );
  newPayment.balance = balance;

  setPaymentTransactions(prev => [...prev, newPayment]);
  setForm(prev => ({ ...prev, payment: '', paymentMethod: '', date: '' }));

  if (paymentMethod !== 'Cash') {
    setBankBalance(prev => prev - amountToPay);
  }

  const paymentData = {
    date: newPayment.date,
    party: newPayment.party,
    method: newPayment.method,
    amount: newPayment.amount,
    balance: newPayment.balance
  };

  sendDataToSheet({ type: "payment", ...paymentData });
};

  const handleAddReturn = async () => {
    const { returnAmount, returnDate } = form;
    if (returnAmount && returnDate && selectedParty) {
      const newReturn = {
        type: 'return',
        amount: parseFloat(returnAmount),
        party: selectedParty,
        date: returnDate
      };
  
      const balance = calculateRunningBalance(
        allTransactions.filter(tx => tx.party === selectedParty),
        newReturn
      );
      newReturn.balance = balance;
  
      setReturnTransactions(prev => [...prev, newReturn]);
      setForm(prev => ({ ...prev, returnAmount: '', returnDate: '' }));
  
      const returnData = {
        date: newReturn.date,
        party: newReturn.party,
        amount: newReturn.amount,
        balance: newReturn.balance
      };

      sendDataToSheet({ type: "return", ...returnData });

    } else {
      alert('Fill all return fields.');
    }
  };
  const handleDeposit = async () =>{
    const amount = parseFloat(depositAmount);
    if(!isNaN(amount) && amount > 0){
      setBankBalance(bankBalance + amount)
      setDepositAmount('');
    } else {
      alert('Please Enter a Valid Number');
    }
  };

  return (
    <div className="home-page">
      
      <div className={`sidebar ${sidebarVisible ? 'visible' : ''}`}>
      <h2 className="nrv-logo">NRV</h2>

        {['home', 'purchase', 'pay', 'return', 'balance', 'party', 'bank'].map(btn => (
          <button key={btn} style={{ marginBottom: '15px' }} onClick={() => setView(btn)}>
          {btn.charAt(0).toUpperCase() + btn.slice(1)}
        </button>
        
        ))}
      </div>

      <div className="content">
        
        <h1>NANDKUMAR RAMACHANDRA VELHAL</h1>
        
        {view === 'home' && (
          <>
            <h3>Total Owed to All Parties: ₹{totalOwedAll.toFixed(2)}</h3>
            <h4>All Transactions</h4>
            <TransactionTable transactions={allTransactions} />
          </>
        )}

        {view === 'purchase' && (
          <div className='form-container'>
            <h2>Purchase Entry</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            <input type="text" placeholder="Bill No" value={form.billNumber} onChange={e => setForm({ ...form, billNumber: e.target.value })} />
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <button className='addPurchase-button'onClick={handleAddPurchase}>Add Purchase</button>
            {form.amount && (
                <div style={{ marginTop: '10px' }}>
                  <p>GST (5%): ₹{(parseFloat(form.amount) * 0.05).toFixed(2)}</p>
                  <p>Total after GST: ₹{(parseFloat(form.amount) * 1.05).toFixed(2)}</p>
                </div>
              )}

          </div>
        )}

        {view === 'pay' && (
          <div className='form-container'>
            <h2>Payment</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <input type="number" placeholder="Amount" value={form.payment} onChange={e => setForm({ ...form, payment: e.target.value })} />
            <select value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
            <option value="">Select Payment Method</option>
              <option value="Cash">Cash</option>
              <option value="NFT">NFT</option>
              <option value="Check">Check</option>
            </select>
            <button className='addPurchase-button'onClick={handleAddPayment}>Add Payment</button>
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
            <button className='addPurchase-button' onClick={handleAddReturn}>Add Return</button>
          </div>
        )}

        {view === 'balance' && (
          <div className='form-container'>
            <h2>Balance for: {selectedParty || 'None selected'}</h2>
            <select value={selectedParty} onChange={e => setSelectedParty(e.target.value)}>
              <option value="">Select Party</option>
              {partiesInfo.map((p, i) => <option key={i} value={p.businessName}>{p.businessName}</option>)}
            </select>
            <p>Total Owed: ₹{totalOwed.toFixed(2)}</p>
            <TransactionTable transactions={filteredTransactions} />
          </div>
        )}

        {view === 'party' && (
          <div className='form-container'>
            <h2>Party Info</h2>
           <PartyInfoTable partiesInfo={partiesInfo} />
            <h2>Add New Party</h2>
            <input placeholder="Business" value={partyInput.businessName} onChange={e => setPartyInput({ ...partyInput, businessName: e.target.value })} />
            <input placeholder="Phone" value={partyInput.phoneNumber} onChange={e => setPartyInput({ ...partyInput, phoneNumber: e.target.value })} />
            <input placeholder="Bank" value={partyInput.bankNumber} onChange={e => setPartyInput({ ...partyInput, bankNumber: e.target.value })} />
            <input placeholder="Bank Number" value={partyInput.bankName} onChange={e => setPartyInput({ ...partyInput, bankName: e.target.value })} />
            <input placeholder="Contact" value={partyInput.contactName} onChange={e => setPartyInput({ ...partyInput, contactName: e.target.value })} />
            <input placeholder="Mobile" value={partyInput.contactMobile} onChange={e => setPartyInput({ ...partyInput, contactMobile: e.target.value })} />
            <button onClick={handleAddParty} className='addPurchase-button'>Add Party</button>
          </div>
        )}

        {view === 'bank' && (
          <div className="form-container">
              <h2>Bank Balance:  ₹{bankBalance.toFixed(2)}</h2>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Enter deposit amount"
              />
              <button
                onClick={handleDeposit}
                className="addPurchase-button"
              >
                Deposit
              </button>
        </div>
        )}
      </div>
    </div>
  );
};

const TransactionTable = ({ transactions }) => {
  let runningBalance = 0;
  return (
   <div className="transaction-table-wrapper">
    <table className="transaction-table">
      <thead>
        <tr>
          <th>Date</th><th>Party</th><th>Type</th><th>Bill No</th><th>Method</th><th>Amount</th><th>Debit</th><th>Credit</th><th>Balance</th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((tx, i) => {
          const debit = tx.type === 'purchase' ? tx.amount : null;
          const credit = tx.type === 'payment' || tx.type === 'return' ? tx.amount : null;
          runningBalance += debit || 0;
          runningBalance -= credit || 0;
          return (
            <tr key={i}>
              <td>{tx.date}</td>
              <td>{tx.party}</td>
              <td>{tx.type}</td>
              <td>{tx.billNumber || '-'}</td>
              <td>{tx.method || '-'}</td>
              <td>₹{parseFloat(tx.amount || 0).toFixed(2)}</td>
              <td>{debit !== undefined ? `₹${parseFloat(debit || 0).toFixed(2)}` : '-'}</td>
              <td>{credit !== undefined ? `₹${parseFloat(credit || 0).toFixed(2)}` : '-'}</td>
              <td>₹{parseFloat(runningBalance || 0).toFixed(2)}</td>

            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
};

const PartyInfoTable = ({ partiesInfo = [] }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('businessName');
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  const filteredAndSorted = partiesInfo
    .filter(p => 
      p.businessName.toLowerCase().includes(search.toLowerCase()) ||
      p.contactName.toLowerCase().includes(search.toLowerCase()) ||
      p.phoneNumber.includes(search) ||
      p.contactMobile.includes(search)
    )
    .sort((a, b) => {
      const aVal = a[sortKey]?.toLowerCase?.() || a[sortKey];
      const bVal = b[sortKey]?.toLowerCase?.() || b[sortKey];
      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(filteredAndSorted.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginated = filteredAndSorted.slice(startIndex, startIndex + rowsPerPage);

  const handleSort = key => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const handleExportCSV = () => {
    const csvRows = [
      ['Business', 'Phone', 'Bank', 'Contact', 'Mobile'],
      ...filteredAndSorted.map(p => [
        p.businessName,
        p.phoneNumber,
        p.bankNumber,
        p.contactName,
        p.contactMobile
      ])
    ];
    const csvContent = csvRows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'party_info.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Search parties..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: '10px', padding: '5px', width: '100%' }}
      />

      <button onClick={handleExportCSV} className='addPurchase-button' >
        Export CSV
      </button>
  <div className="transaction-table-wrapper">
      <table className="transaction-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('businessName')}>Business {sortKey === 'businessName' && (sortAsc ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('phoneNumber')}>Phone {sortKey === 'phoneNumber' && (sortAsc ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('bankNumber')}>Bank {sortKey === 'bankNumber' && (sortAsc ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('contactName')}>Contact {sortKey === 'contactName' && (sortAsc ? '▲' : '▼')}</th>
            <th onClick={() => handleSort('contactMobile')}>Mobile {sortKey === 'contactMobile' && (sortAsc ? '▲' : '▼')}</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((p, i) => (
            <tr key={i}>
              <td>{p.businessName}</td>
              <td>{p.phoneNumber}</td>
              <td>{p.bankNumber}</td>
              <td>{p.contactName}</td>
              <td>{p.contactMobile}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '10px' }}>
        Page {currentPage} of {totalPages}
        <br />
        <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>Previous</button>
        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>Next</button>
      </div>
      </div>
    </div>
  
  );
};

export default HomePage;