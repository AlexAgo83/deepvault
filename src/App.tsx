import { AppShell } from './components/app-shell'
import { useAppModel } from './hooks/useAppModel'

export default function App() {
  const model = useAppModel()

  return <AppShell {...model} />
}
