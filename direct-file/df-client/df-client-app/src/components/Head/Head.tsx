import { FC } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { isStaticClientOnly } from '../../staticClient/staticMode.js';

const Head: FC = () => {
  const { t } = useTranslation(`translation`);
  // The static client-only build is an unofficial preview, so its titles don't name the agency.
  const titleBoilerplate = isStaticClientOnly()
    ? t(`staticClient.pageTitle`)
    : `${t(`pageTitle.product`)} | ${t(`pageTitle.agency`)}`;
  return <Helmet defaultTitle={titleBoilerplate} titleTemplate={`%s | ${titleBoilerplate}`} />;
};

export default Head;
