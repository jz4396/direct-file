import { forwardRef } from 'react';

import { type Dollar } from '@irs/js-factgraph-scala';

import { type FactProps } from '../../types/core.js';
import useFact from '../../hooks/useFact.js';
import { DollarImplementation } from './Dollar.js';

/**
 * Whole square feet for Schedule C line 30. The fact stays a Dollar so the value is saved through DollarFactory.
 * RoundToInt in scheduleC.xml turns it into the square footage used in the simplified-method worksheet.
 */
const SquareFeet = forwardRef<HTMLInputElement, FactProps>(({ concretePath, ...props }, ref) => {
  const [fact, setFact, clearFact] = useFact<Dollar>(concretePath);

  return (
    <DollarImplementation
      concretePath={concretePath}
      fact={fact}
      setFact={setFact}
      clearFact={clearFact}
      forceUpdateInput
      {...props}
      inputPrefix=''
      wholeDigits
      ref={ref}
    />
  );
});
SquareFeet.displayName = `SquareFeet`;

export default SquareFeet;
