import { useEffect, useState } from "react";
import type { Expense } from "../../Entities/Expense/Models/Expense";
import { useParams } from "react-router-dom";


export function ExpenseDetails() {

    const { id } = useParams<{ id: string }>();
    const [expense, setExpense] = useState<Expense | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        fetch(`http://localhost:3000/expenses/${id}`)
            .then(response => {
            
                if (!response.ok) {
                    throw new Error('Expense not found');
                }
                return response.json();
            })
            .then(data => {
                console.log("Fetched expense:", data);
                setLoading(false);
                setExpense(data);
            })
            .catch(error => {
                console.error("Error fetching expense:", error);
                setLoading(false);
                setError(error.message);
            });
    }, [id]);

  return (
    <div>
      <h1>Expense Details</h1>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {expense && (
        <div>
          <p><strong>Category:</strong> {expense.category}</p>
          <p><strong>Description:</strong> {expense.description}</p>
          <p><strong>Amount:</strong> ${expense.amount.toFixed(2)}</p>
          <p><strong>Date:</strong> {expense.date.toString()}</p>
        </div>
      )}    
    </div>
  );
}