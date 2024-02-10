import { Container, Nav, Navbar } from "react-bootstrap";
import { Link, Outlet } from "react-router-dom";

export default function Root() {
  return (
    <>
      <Navbar bg="light" expand="sm">
        <Container>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} className="me-2" to="/">Home</Nav.Link>
              <Nav.Link as={Link} className="me-2" to="/monte_carlo">Monte Carlo</Nav.Link>
              <Nav.Link as={Link} className="me-2" to="https://venmo.com/u/JohnMangel" target="_blank" >Send Me a Tip (thanks! ＼(´∀｀)／)</Nav.Link>
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Outlet />
    </>
  );
}
