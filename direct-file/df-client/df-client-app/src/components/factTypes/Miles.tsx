import { forwardRef } from 'react';

import { type Dollar } from '@irs/js-factgraph-scala';

import { type FactProps } from '../../types/core.js';
import useFact from '../../hooks/useFact.js';
import { DollarImplementation } from './Dollar.js';

/**
 * Whole miles for Schedule C line 9 and Part IV. The fact stays a Dollar so the value is saved through DollarFactory.
 * RoundToInt in scheduleC.xml turns business, commuting, and other miles into the counts printed on Part IV.
 */
const Miles = forwardRef<HTMLInputElement, FactProps>(({ concretePath, ...props }, ref) => {
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
Miles.displayName = `Miles`;

export default Miles;
