import './App.css'
import { BrowserRouter } from 'react-router-dom'
import { AppProviders } from './provider/AppProviders'
import { AppRoutes } from './routes/AppRoutes'

export const App = () => {
  return (
    <BrowserRouter>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  )
}
