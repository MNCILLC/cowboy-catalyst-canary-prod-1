import React, { type FunctionComponent } from 'react';

import { type ShoppingLocation } from './shoppingLocation';

import './PickupLocationNotice.scss';

interface PickupLocationNoticeProps {
    location: ShoppingLocation;
}

const PickupLocationNotice: FunctionComponent<PickupLocationNoticeProps> = ({ location }) => (
    <section aria-label="Pickup location" className="pickupLocationNotice">
        <div className="pickupLocationNotice-label">Warehouse pickup</div>
        <strong className="pickupLocationNotice-name">Pickup at {location.label} Warehouse</strong>
        <p className="pickupLocationNotice-description">
            Every item in this order is reserved for pickup at this location.
        </p>
    </section>
);

export default PickupLocationNotice;
