import { FC, useCallback, useContext } from 'react';
import { Button, Icon } from '@trussworks/react-uswds';
import Translation from '../Translation/index.js';
import { NetworkConnectionContext } from '../../context/networkConnectionContext.js';
import styles from './DownloadPDFButton.module.scss';
import { useFetchPdf } from '../../hooks/useApiHook.js';
import classNames from 'classnames';
import LoadingIndicator from '../LoadingIndicator/LoadingIndicator.js';
import DFAlert from '../Alert/DFAlert.js';
import { STATIC_PDF_REFUSAL_I18N } from '../../staticClient/staticRefusal.js';

type DownloadPDFButtonProps = {
  taxId: string;
  i18nKey: string;
  context?: object;
  inline?: boolean;
  frontpage?: boolean;
};

const DownloadPDFButton: FC<DownloadPDFButtonProps> = ({
  i18nKey,
  taxId,
  context,
  inline = false,
  frontpage = false,
}) => {
  const { online } = useContext(NetworkConnectionContext);
  const { fetchPdf, loading, refused } = useFetchPdf();

  const handleClick = useCallback(async () => {
    if (taxId && !loading) void fetchPdf(taxId);
  }, [fetchPdf, loading, taxId]);

  const buttonClasses = classNames({
    'usa-button--disabled': !online || loading,
    'padding-left-6': !inline,
    [`${styles.dfDownloadButton}`]: !inline,
  });

  const wrappedButtonClasses = classNames({
    'usa-button--disabled': loading,
  });

  const buttonStyle = frontpage ? styles.dfFrontPageButtonWrapper : styles.dfDownloadButtonWrapper;

  const refusal = refused ? (
    <DFAlert
      i18nKey={STATIC_PDF_REFUSAL_I18N}
      collectionId={null}
      type='error'
      headingLevel='h2'
      data-testid='static-pdf-refusal'
    />
  ) : null;

  if (inline)
    return (
      <>
        {refusal}
        <Button type={`button`} onClick={handleClick} unstyled className={buttonClasses}>
          <Translation i18nKey={i18nKey} collectionId={null} context={context} />
        </Button>
      </>
    );

  return (
    <div className={buttonStyle}>
      {refusal}
      <Button type='button' onClick={handleClick} outline className={wrappedButtonClasses}>
        {loading ? (
          <LoadingIndicator i18nKey='loadingIndicator.downloadingPDF' inline delayMS={0} />
        ) : (
          <Icon.FileDownload size={3} className='usa-button__icon-left' aria-hidden='true' />
        )}
        <Translation i18nKey={i18nKey} collectionId={null} context={context} />
      </Button>
    </div>
  );
};

export default DownloadPDFButton;
