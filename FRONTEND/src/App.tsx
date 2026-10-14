import './App.css'
import { BrowserRouter } from 'react-router-dom'
import { AppProviders } from './provider/AppProviders'
import { AppRoutes } from './routes/AppRoutes'
import { TitleBar } from '@components/layout/TitleBar'

export const App = () => {
  return (
    <BrowserRouter>
      <AppProviders>
        {/* Barra de título propia arriba; el resto de la app ocupa lo que queda. */}
        <div className="h-full flex flex-col">
          <TitleBar />
          <div className="flex-1 min-h-0 relative">
            <AppRoutes />
          </div>
        </div>
      </AppProviders>
    </BrowserRouter>
  )
}
