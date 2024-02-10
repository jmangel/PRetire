import { Dispatch, SetStateAction } from "react";
import { Button, Col, Row } from "react-bootstrap";

type Props = {
  numRows: number;
  setNumRows?: Dispatch<SetStateAction<number>>;
  buttonText?: string;
  rowComponent: React.ReactNode | ((index: number) => React.ReactNode);
}

const HasManyRows = ({ numRows, setNumRows, buttonText, rowComponent }: Props) => {
  return (
    <>
      {[...Array(numRows)].map((_, index) =>
        rowComponent instanceof Function ? rowComponent(index) : rowComponent
      )}
      {setNumRows && (
         <Row className="my-2"><Col>
          <Button type="button" onClick={() => setNumRows(prev => prev + 1)}>
            {buttonText || 'Add a row'}
          </Button>
        </Col></Row>
      )}
    </>
  )
}

export default HasManyRows;