import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import HomePage from './HomePage';
import Login from './Login';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div style={{ textAlign: 'center' }}>Loading...</div>;

  return (
    <Router>
      <Routes>
        {user ? (
          <Route path="/*" element={<HomePage />} />
        ) : (
          <Route path="/*" element={<Login />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
