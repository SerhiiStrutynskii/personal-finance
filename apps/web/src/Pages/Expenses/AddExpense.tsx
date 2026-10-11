import { useState } from "react"
import type { Expense } from "../../Entities/Expense/Models/Expense";


function AddExpense() {

  const [expense, setExpenses] = useState<Expense>({
    amount: 0,
    description: "",
    date: new Date(),
    category: ""
  });

  const handleAddExpense = () => {
    fetch("http://localhost:3000/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(expense)
    })
    .then(response => response.json())
    .then((data: Expense) => {
      console.log("Expense added:", data);
      setExpenses({
        amount: 0,
        description: "",
        date: new Date(),
        category: ""
      });
    })
    .catch(error => {
      console.error("Error adding expense:", error);
    });
  }

  
  return (
    <div>
      <h1>Personal Finance App</h1>
      <p>Welcome to the Personal Finance App!</p>
      <div>
        <input 
          type="text" 
          placeholder="Amount" 
          value={expense.amount}
          onChange={(e) => setExpenses({...expense, amount: parseFloat(e.target.value) || 0})}
        />
        <input 
          type="text" 
          placeholder="Description" 
          value={expense.description}
          onChange={(e) => setExpenses({...expense, description: e.target.value})}
        />
        <input 
          type="date" 
          placeholder="Date" 
          value={expense.date.toISOString().split('T')[0]}
          onChange={(e) => setExpenses({...expense, date: new Date(e.target.value)})}
        />
        <input 
          type="text" 
          placeholder="Category" 
          value={expense.category}
          onChange={(e) => setExpenses({...expense, category: e.target.value})}
        />
        <button onClick={handleAddExpense}>Add Expense</button>
      </div>
    </div>
  )
}

export default AddExpense
