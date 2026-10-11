import { useState, useEffect } from "react"
import type { Expense } from "../../Entities/Expense/Models/Expense";
import { Link } from "react-router-dom";

function ExpensesList() {



  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    fetch("http://localhost:3000/expenses")
      .then(response => response.json())
      .then(data => {
        console.log("Fetched expenses:", data);
        setAllExpenses(data);
      })
      .catch(error => {
        console.error("Error fetching expenses:", error);
      });
  }, []); 

  
  return (
    <div>
        Link to add expense: <Link to="/expenses/add">Add Expense</Link>
      <div>
        <ul>
          {allExpenses.map((exp: Expense) => (
            <li key={exp.id}>
              <Link to={`/expenses/${exp.id}`}>
                {exp.amount} - {exp.description} - {new Date(exp.date).toLocaleDateString()} - {exp.category}
              </Link>
            </li>
          ))}
        </ul>
      </div>      
    </div>

  
  )
}

export default ExpensesList
