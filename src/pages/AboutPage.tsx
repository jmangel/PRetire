import { ReactNode } from 'react';
import { Card, Col, Container, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';

export const FEATURES: { title: string; body: ReactNode }[] = [
  {
    title: 'Unlimited time-bound income sources',
    body: (
      <>
        Most retirement projections start from the retirement date.
        With PREtire, you can <b>configure as many income sources as you want across different dates</b>,
        so you can plan ahead whether you're just starting your career,
        considering a move to a slower-paced job,
        or ready to semi-retire before you give up work completely.
      </>
    ),
  },
  {
    title: 'Plan for big purchases, sales, or other changes',
    body: (
      <>
        Planning to sell your house in a couple years, then rent for a year, then maybe buy a bigger house?
        Plug all your planned sales, purchases, and changes to monthly expenses into the
        Life Events settings tab and see the projection graphs adjust to your plans.
      </>
    ),
  },
  {
    title: 'Fully customize your asset allocation',
    body: (
      <>
        Set up as many asset classes as you like, and make adjustments to the simulator even down to the standard deviation of each asset class.
      </>
    ),
  },
];

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
