import { createBrowserRouter } from "react-router";
import Root from "./Root";
import ExpensesList from "../Pages/Expenses/ExpensesList";
import AddExpense from "../Pages/Expenses/AddExpense";
import Dashboard from "../Pages/Dashboard/Dashboard";
import { Expenses } from "../Pages/Expenses/Expenses";


const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: "expenses", Component: Expenses,  children: [
        {
            index: true,
            Component: ExpensesList,
            loader: async () => {
                const expenses = await fetch("http://localhost:3000/expenses");
                return { expenses };
            }
          },
          {
            path: "add",
            Component: AddExpense,
          },
        ], 
},
    ],
  },
]);

export { router };