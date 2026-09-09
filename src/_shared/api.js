export const fetchStats = () => {
  // TODO: replace with real API call
  return [
    { label: "Sales Today", value: 486250, delta: "+12.4%", dir: "up", vs: "vs yesterday" },
    { label: "Collections", value: 128400, delta: "+38 installments", dir: "up", vs: "today" },
    { label: "KYC Pending", value: 187, delta: "23 need review", dir: "down", vs: "queue" },
    { label: "New Customers", value: 96, delta: "+8.1%", dir: "up", vs: "this month" },
  ];
};

export const fetchRecent = () => {
  // TODO: replace with real API call
  return [
    {
      name: "Suresh Ravichandran",
      code: "DFX-CUST-000122",
      plan: "Gold Saver 11+1",
      amount: 5000,
      method: "UPI",
      time: "09:42",
      status: "success",
    },
    {
      name: "Priya Raj",
      code: "DFX-CUST-000120",
      plan: "Silver Flexi",
      amount: 2500,
      method: "Cash",
      time: "09:18",
      status: "success",
    },
    {
      name: "Uma Gopal",
      code: "DFX-CUST-000119",
      plan: "Diamond Plus",
      amount: 10000,
      method: "Card",
      time: "08:55",
      status: "warning",
    },
    {
      name: "Ganesh Venkatesan",
      code: "DFX-CUST-000123",
      plan: "Gold Saver 11+1",
      amount: 5000,
      method: "UPI",
      time: "08:31",
      status: "success",
    },
  ];
};

export const fetchMix = () => {
  // TODO: replace with real API call
  return [
    { name: "Gold Saver", pct: 46, color: "#059669" },
    { name: "Silver Flexi", pct: 31, color: "#34d399" },
    { name: "Diamond Plus", pct: 23, color: "#1c1917" },
  ];
};

export const formatINR = (num) => `₹${num.toLocaleString()}`;