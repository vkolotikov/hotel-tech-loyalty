import { Redirect } from 'expo-router'

/** Appointment/stay booking is outside the loyalty-only members app. */
export default function DeferredBooking() { return <Redirect href="/" /> }
