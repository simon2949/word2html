import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AdminReviewApp from './AdminReviewApp'
import CapabilityReviewApp from './CapabilityReviewApp'
import ModelSettingsApp from './ModelSettingsApp'
import AdminUsersApp from './AdminUsersApp'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('找不到应用挂载节点')

createRoot(root).render(
  <StrictMode>
    {window.location.pathname.startsWith('/admin/capabilities')
      ? <CapabilityReviewApp />
      : window.location.pathname.startsWith('/admin/users')
        ? <AdminUsersApp />
      : window.location.pathname.startsWith('/admin/models')
        ? <ModelSettingsApp />
      : window.location.pathname.startsWith('/admin/reviews')
        ? <AdminReviewApp />
        : <App />}
  </StrictMode>,
)
