import { useTranslation } from 'react-i18next';

/**
 * Notice shown at the top of every page of the static client-only build, in place of the government site banner.
 * It has no close control: the preview must never look like the official service.
 */
const StaticClientBanner = () => {
  const { t } = useTranslation(`translation`);
  return (
    <section
      className='usa-site-alert usa-site-alert--emergency usa-site-alert--slim'
      aria-label={t(`staticClient.banner.label`)}
      data-testid='static-client-banner'
    >
      <div className='usa-alert'>
        <div className='usa-alert__body'>
          <p className='usa-alert__text'>
            <strong>{t(`staticClient.banner.heading`)}</strong> {t(`staticClient.banner.body`)}
          </p>
        </div>
      </div>
    </section>
  );
};

export default StaticClientBanner;
