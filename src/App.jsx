import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Inicio from './paginas/Inicio'
import Agendar from './paginas/Agendar'
import Ingresar from './paginas/Ingresar'
import Panel from './paginas/Panel'
import Cancelar from './paginas/Cancelar'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/agendar/:slug" element={<Agendar />} />
        <Route path="/cancelar/:token" element={<Cancelar />} />
        <Route path="/ingresar" element={<Ingresar />} />
        <Route path="/panel" element={<Panel />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
