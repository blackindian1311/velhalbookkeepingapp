import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './HomePage'; // Import the HomePage component

function App() {
  return (
    <Router>
      <Routes>
        {/* Define a route to display the HomePage */}
        <Route path="/" element={<HomePage />} />
      </Routes>
    </Router>
  );
}
document.addEventListener('DOMContentLoaded', () => {
  const sidebarButtons = document.querySelectorAll('.sidebar button');

  sidebarButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove 'active' class from all buttons
      sidebarButtons.forEach(btn => btn.classList.remove('active'));
      
      // Add 'active' class to the clicked button
      button.classList.add('active');
    });
  });
});
export default App;
