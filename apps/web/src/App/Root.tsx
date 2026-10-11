import { Outlet } from "react-router-dom";
import Sidebar from "../Widgets/Sidebar/Sidebar";


function Root() {
  return (
    <main className="h-screen flex gap-4 bg-[f3f5f7] px-3 py-4">
      <Sidebar/>
      <main className="bg-white border-2 rounded-md border-[rgba(0,0,0,0.1)] w-full p-4 shadow-sm">
        <Outlet />
      </main>
    </main>
  );
}

export default Root;
