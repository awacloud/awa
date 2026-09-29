import { SignupIsland } from '../../components/SignupIsland';

export const metadata = { title: 'fw × Next — form' };

export default function FormPage() {
    return (
        <>
            <h1>Form validation island</h1>
            <p>
                The fw <code>form</code> module owns the multi-field state
                (values / errors / touched / dirty / submitting), per-field validation and the
                async submit. Here: two required fields with validators, errors shown only after{' '}
                <em>touch</em> (blur), the button disabled while submitting, and each successful
                signup pushed into a keyed list (<code>uiSession.list</code>).
            </p>
            <SignupIsland />
            <p>
                All the state lives in the island, client-side — the page itself is a static
                server component.
            </p>
        </>
    );
}
