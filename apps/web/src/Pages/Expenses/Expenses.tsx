import { Outlet } from "react-router-dom"

export function Expenses() {
  return (
    <div>
      <h1>Expenses</h1>
      <div>
        <Outlet />
      </div>
    </div>
  )
}

export default Expenses