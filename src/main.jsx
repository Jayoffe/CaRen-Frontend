import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ChatWidget from '../../chatbot/frontend/ChatWidget.jsx'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <>
      <App />
      <ChatWidget />
    </>
  </StrictMode>,
)
