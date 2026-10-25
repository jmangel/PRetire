import { Card, Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FEATURES } from '../content/features';

const AboutPage = () => (
  <Container className="my-4">
    <div className="text-center mb-4">
      <h1>About PREtire</h1>
      <p className="lead">Fully configurable Monte Carlo retirement projections.</p>
      <Link to="/monte_carlo" className="btn btn-primary">Start planning</Link>
    </div>

    <h4>Your data stays with you</h4>
    <p>
      All computation is done in your browser and your data never leaves your device.
      Export or import settings locally from a JSON file so you can save your scenarios privately.
    </p>

    <h4 className="mt-4">Fully configure your Monte Carlo simulations</h4>
    <Row xs={1} md={3} className="g-3">
      {FEATURES.map(({ title, body }) => (
        <Col key={title}>
          <Card className="h-100">
            <Card.Body>
              <Card.Title as="h5">{title}</Card.Title>
              <Card.Text>{body}</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      ))}
    </Row>
  </Container>
);

export default AboutPage;
