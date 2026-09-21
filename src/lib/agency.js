// Central agency identity used across the booking-ops suite (invoices, tarmac, broadcast).
export const AGENCY = {
  name: "Ride X Live Routing Desk",
  email: "routing@ridex.live",
  phone: "+234 902 004 2099",
  banks: "Zenith Bank PLC / Guaranty Trust Bank",
};

// 20% gross-up: client pays `gross`, artist keeps `net`, agency keeps the rest.
export const grossUp = (gross) => {
  const g = Number(gross) || 0;
  const net = Math.round(g / 1.2);
  return { gross: g, net, agency: g - net };
};