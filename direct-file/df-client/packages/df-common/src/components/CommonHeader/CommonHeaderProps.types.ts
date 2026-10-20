export type CommonHeaderProps = {
  headerAriaLabel: string;
  dfPrefix?: string;
  navMenuLabel: string;
  menuItems?: React.ReactNode[];
  children: React.ReactNode;
  homeLink: string;
  homeLinkTitle: string;
  /** Image shown in the home link. */
  logoSrc?: string;
  /** Text shown in the home link when there is no logoSrc. */
  logoText?: string;
};
