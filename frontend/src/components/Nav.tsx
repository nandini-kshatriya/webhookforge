import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Overview" },
  { to: "/events", label: "Events" },
  { to: "/subscribers", label: "Subscribers" },
  { to: "/deliveries", label: "Deliveries" },
];

export default function Nav() {
  return (
    <div className="subnav">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === "/"}
          className={({ isActive }) => (isActive ? "subnav-link active" : "subnav-link")}
        >
          {l.label}
        </NavLink>
      ))}
    </div>
  );
}