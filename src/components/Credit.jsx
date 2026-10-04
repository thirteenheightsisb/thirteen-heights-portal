import { CREDIT_TOP, CREDIT_COMPANY, CREDIT_SIGNATURE } from '../credits'

export default function Credit() {
  return (
    <div className="credit" aria-label={`${CREDIT_TOP} ${CREDIT_COMPANY}, ${CREDIT_SIGNATURE}`}>
      <span className="credit-top">{CREDIT_TOP}</span>
      <span className="credit-company">{CREDIT_COMPANY}</span>
      <span className="credit-name">{CREDIT_SIGNATURE}</span>
    </div>
  )
}
