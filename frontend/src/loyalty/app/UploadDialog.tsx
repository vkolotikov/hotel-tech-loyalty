import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { FormField, FormFoot } from '../ui/formParts'
import { WALLET_KEY, appApi } from './api'
import { FILE_ACCEPT, fileState, replaces } from './appMath'
import { ERRORS } from './errors'
import { INPUT } from './parts'
import type { Wallet, WalletFile } from './types'
import { FILE_LINE_WORDS, FILE_WORDS } from './words'

/**
 * Upload one of the wallet's three files (release 2 §7). Over a file that is there, the dialog says first that it
 * replaces it. The certificate takes its password beside it — typed here, sent once, never shown; empty keeps the saved
 * one, which must then open the new file. The server checks the file by its content and says what is wrong in a code
 * the workspace words (errors.ts `upload`).
 */
export function UploadDialog({ kind, wallet, onClose }: { kind: WalletFile; wallet: Wallet; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const replacing = replaces(fileState(kind, wallet))
  const name = t(`loyalty.app.file.${kind}`, FILE_WORDS[kind])

  const send = useMutation({
    mutationFn: (chosen: File) => appApi.uploadWalletFile(kind, chosen, password),
    onSuccess: (answer) => { client.setQueryData(WALLET_KEY, answer); onClose() },
  })
  const failure = send.isError ? failureOf(send.error) : null

  return (
    <Dialog title={name} onClose={onClose} busy={send.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (file) send.mutate(file)
      }}>
        <p className="text-sm text-a-text-2">{t(`loyalty.app.file_line.${kind}`, FILE_LINE_WORDS[kind])}</p>
        {replacing && (
          <Notice tone="warning">{t('loyalty.app.upload.replaces', 'One is uploaded already. Uploading replaces it, and the old one cannot be brought back.')}</Notice>
        )}

        <FormField label={t('loyalty.app.upload.file', 'File')} problem={tried && !file ? t('loyalty.app.upload.choose', 'Choose the file first.') : null}>
          <input ref={first} type="file" accept={FILE_ACCEPT[kind]} onChange={(e) => { setFile(e.target.files?.[0] ?? null); send.reset() }}
            className="block w-full text-sm text-a-text file:mr-3 file:rounded-full file:border file:border-a-border file:bg-a-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-a-text" />
        </FormField>

        {kind === 'apple_cert' && (
          <FormField label={t('loyalty.app.upload.password', 'Certificate password')}
            hint={wallet.apple_cert_password_set
              ? t('loyalty.app.upload.password_keep', 'Empty: the saved password is used.')
              : t('loyalty.app.upload.password_hint', 'The password chosen when the certificate was exported.')}>
            <input type="password" value={password} maxLength={255} autoComplete="new-password" onChange={(e) => { setPassword(e.target.value); send.reset() }} className={INPUT} />
          </FormField>
        )}

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.app', ERRORS, 'upload', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={send.isPending} onCancel={onClose}
          save={replacing ? t('loyalty.app.upload.replace', 'Replace') : t('loyalty.app.upload.upload', 'Upload')} />
      </form>
    </Dialog>
  )
}
