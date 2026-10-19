import { ChangeEvent, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Checkbox, Label, TextInput } from '@trussworks/react-uswds';
import { useFactGraph, replaceFactGraphWithFacts } from '../factgraph/FactGraphContext.js';
import { useFlow } from '../flow/flowConfig.js';
import PageTitle from '../components/PageTitle/index.js';
import { downloadSaveFile, exportSaveFile, importSaveFile, isEncryptedSaveFile } from './saveStateFile.js';
import { clearAllDeviceData, hasDeviceSave, loadFromDevice, saveToDevice } from './deviceSaveStore.js';
import { MIN_PASSPHRASE_LENGTH } from './saveStateCrypto.js';
import { SaveStateError } from './saveStateErrors.js';

type Status = { type: `success` | `error` | `warning`; key: string } | null;

const errorKey = (err: unknown) =>
  `account.deviceData.errors.${err instanceof SaveStateError ? err.code : `invalid-file`}`;

/**
 * Save, export, import and clear the return in this browser. No network requests are made here; passphrases live
 * only in component state and are cleared after each operation. Nothing is logged.
 */
const DeviceDataPage = () => {
  const { t } = useTranslation(`translation`);
  const { factGraph } = useFactGraph();
  const flow = useFlow();

  const [exportPassphrase, setExportPassphrase] = useState(``);
  const [acceptPlaintext, setAcceptPlaintext] = useState(false);
  const [importFileText, setImportFileText] = useState<string | null>(null);
  const [importPassphrase, setImportPassphrase] = useState(``);
  const [devicePassphrase, setDevicePassphrase] = useState(``);
  const [deviceSaved, setDeviceSaved] = useState(hasDeviceSave());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const run = useCallback(async (fn: () => Promise<Status>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus(await fn());
    } catch (err) {
      setStatus({ type: `error`, key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  }, []);

  const currentFacts = () => JSON.parse(factGraph.toJSON());

  const handleExport = () =>
    run(async () => {
      const file = await exportSaveFile(currentFacts(), { passphrase: exportPassphrase || undefined });
      downloadSaveFile(file);
      setExportPassphrase(``);
      setAcceptPlaintext(false);
      return {
        type: `success`,
        key: file.encrypted ? `account.deviceData.export.doneEncrypted` : `account.deviceData.export.donePlain`,
      };
    });

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setStatus(null);
    if (!file) return setImportFileText(null);
    file.text().then(setImportFileText, () => setStatus({ type: `error`, key: errorKey(null) }));
  };

  const handleImport = () =>
    run(async () => {
      if (importFileText === null) return null;
      const state = await importSaveFile(importFileText, importPassphrase || undefined);
      replaceFactGraphWithFacts(state.facts, flow);
      setImportPassphrase(``);
      setImportFileText(null);
      return { type: `success`, key: `account.deviceData.import.done` };
    });

  const handleSaveToDevice = () =>
    run(async () => {
      await saveToDevice(currentFacts(), devicePassphrase);
      setDevicePassphrase(``);
      setDeviceSaved(true);
      return { type: `success`, key: `account.deviceData.device.saved` };
    });

  const handleLoadFromDevice = () =>
    run(async () => {
      const state = await loadFromDevice(devicePassphrase);
      replaceFactGraphWithFacts(state.facts, flow);
      setDevicePassphrase(``);
      return { type: `success`, key: `account.deviceData.device.loaded` };
    });

  const handleClearAll = () =>
    run(async () => {
      await clearAllDeviceData();
      setDeviceSaved(false);
      setExportPassphrase(``);
      setImportPassphrase(``);
      setDevicePassphrase(``);
      setImportFileText(null);
      return { type: `success`, key: `account.deviceData.clear.done` };
    });

  const exportNeedsAck = exportPassphrase.length === 0 && !acceptPlaintext;
  const exportPassphraseTooShort = exportPassphrase.length > 0 && exportPassphrase.length < MIN_PASSPHRASE_LENGTH;
  const importNeedsPassphrase = importFileText !== null && isEncryptedSaveFile(importFileText);

  return (
    <>
      <PageTitle redactedTitle={t(`account.deviceData.title`)}>{t(`account.deviceData.title`)}</PageTitle>
      <p>{t(`account.deviceData.intro`)}</p>
      <Alert type='warning' headingLevel='h2' heading={t(`account.deviceData.sharedComputer.heading`)} slim={false}>
        {t(`account.deviceData.sharedComputer.body`)}
      </Alert>
      {status && (
        <Alert type={status.type} headingLevel='h2' slim role='status' data-testid='device-data-status'>
          {t(status.key, { minLength: MIN_PASSPHRASE_LENGTH })}
        </Alert>
      )}

      <h2>{t(`account.deviceData.export.heading`)}</h2>
      <p>{t(`account.deviceData.export.body`, { minLength: MIN_PASSPHRASE_LENGTH })}</p>
      <Label htmlFor='export-passphrase'>{t(`account.deviceData.passphraseOptional`)}</Label>
      <TextInput
        id='export-passphrase'
        name='export-passphrase'
        type='password'
        autoComplete='new-password'
        value={exportPassphrase}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setExportPassphrase(e.target.value)}
      />
      {exportPassphrase.length === 0 && (
        <>
          <Alert type='warning' headingLevel='h3' slim>
            {t(`account.deviceData.export.plaintextWarning`)}
          </Alert>
          <Checkbox
            id='export-plaintext-ack'
            name='export-plaintext-ack'
            label={t(`account.deviceData.export.plaintextAck`)}
            checked={acceptPlaintext}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setAcceptPlaintext(e.target.checked)}
          />
        </>
      )}
      <Button type='button' disabled={busy || exportNeedsAck || exportPassphraseTooShort} onClick={handleExport}>
        {t(`account.deviceData.export.button`)}
      </Button>

      <h2>{t(`account.deviceData.import.heading`)}</h2>
      <p>{t(`account.deviceData.import.body`)}</p>
      <Label htmlFor='import-file'>{t(`account.deviceData.import.fileLabel`)}</Label>
      <input
        id='import-file'
        className='usa-file-input'
        type='file'
        accept='application/json,.json'
        onChange={handleFile}
      />
      {importNeedsPassphrase && (
        <>
          <Label htmlFor='import-passphrase'>{t(`account.deviceData.passphrase`)}</Label>
          <TextInput
            id='import-passphrase'
            name='import-passphrase'
            type='password'
            autoComplete='current-password'
            value={importPassphrase}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setImportPassphrase(e.target.value)}
          />
        </>
      )}
      <Button type='button' disabled={busy || importFileText === null} onClick={handleImport}>
        {t(`account.deviceData.import.button`)}
      </Button>

      <h2>{t(`account.deviceData.device.heading`)}</h2>
      <p>{t(`account.deviceData.device.body`, { minLength: MIN_PASSPHRASE_LENGTH })}</p>
      <Label htmlFor='device-passphrase'>{t(`account.deviceData.passphrase`)}</Label>
      <TextInput
        id='device-passphrase'
        name='device-passphrase'
        type='password'
        autoComplete='new-password'
        value={devicePassphrase}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDevicePassphrase(e.target.value)}
      />
      <Button
        type='button'
        disabled={busy || devicePassphrase.length < MIN_PASSPHRASE_LENGTH}
        onClick={handleSaveToDevice}
      >
        {t(`account.deviceData.device.saveButton`)}
      </Button>
      <Button
        type='button'
        outline
        disabled={busy || !deviceSaved || devicePassphrase.length === 0}
        onClick={handleLoadFromDevice}
      >
        {t(`account.deviceData.device.loadButton`)}
      </Button>

      <h2>{t(`account.deviceData.clear.heading`)}</h2>
      <p>{t(`account.deviceData.clear.body`)}</p>
      <Button type='button' secondary disabled={busy} onClick={handleClearAll}>
        {t(`account.deviceData.clear.button`)}
      </Button>
    </>
  );
};

export default DeviceDataPage;
