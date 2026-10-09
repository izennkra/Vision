import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/design-system.css'
import App from './App'
// Icônes Phosphor en graisse « bold » : épaisseur de trait la plus proche des captures.
import { IconContext } from '@phosphor-icons/react'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <IconContext.Provider value={{ weight: 'bold' }}>
        <App />
      </IconContext.Provider>
    </BrowserRouter>
  </StrictMode>,
)
