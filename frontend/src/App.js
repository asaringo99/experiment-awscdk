import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState('');

  const schema = "http"
  const host = "localhost"
  const port = 8080
  const endpoint = "hello"
  const url = `${schema}://${host}:${port}/${endpoint}`

  useEffect(() => {
    console.log(url)
    fetch(url)
      .then(response => response.text())
      .then(data => setMessage(data))
      .catch(error => setMessage("error!w"));
  }, []);

  return (
    <div className="App">
      <h1>{message}</h1>
    </div>
  );
}

export default App;
