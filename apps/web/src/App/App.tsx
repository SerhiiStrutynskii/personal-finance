import { StrictMode } from "react";
import "../App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Dashboard from "../Pages/Dashboard/Dashboard";
import { Expenses } from "../Pages/Expenses/Expenses";
import ExpensesList from "../Pages/Expenses/ExpensesList";
import AddExpense from "../Pages/Expenses/AddExpense";
import Root from "./Root";
import { ExpenseDetails } from "../Pages/Expenses/ExpenseDetails";


function App() {
  return (
    <StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Root />}>
            <Route index element={<Dashboard />} />
            <Route path="expenses" element={<Expenses />}>
              <Route index element={<ExpensesList />} />
              <Route path="add" element={<AddExpense />} />
              <Route path=":id" element={<ExpenseDetails />} />
            </Route>
          </Route>
          
        </Routes>
      </BrowserRouter>
    </StrictMode>
  )
}

export default App
