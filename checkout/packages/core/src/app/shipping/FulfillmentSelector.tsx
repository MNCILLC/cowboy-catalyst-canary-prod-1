import React, { type FunctionComponent } from 'react';

import { type ShoppingLocation } from './shoppingLocation';

import './FulfillmentSelector.scss';

interface FulfillmentSelectorProps {
    isLoading: boolean;
    isPickup: boolean;
    location?: ShoppingLocation;
    onChange(isPickup: boolean): Promise<void>;
}

const FulfillmentSelector: FunctionComponent<FulfillmentSelectorProps> = ({
    isLoading,
    isPickup,
    location,
    onChange,
}) => (
    <fieldset className="fulfillmentSelector">
        <legend className="body-bold">Delivery method</legend>
        <div className="fulfillmentSelector-options">
            <div className="fulfillmentSelector-option">
                <input
                    aria-label="Ship"
                    checked={!isPickup}
                    disabled={isLoading}
                    id="fulfillment-method-ship"
                    name="fulfillmentMethod"
                    onChange={() => onChange(false)}
                    type="radio"
                />
                <span className="fulfillmentSelector-optionText">
                    <strong>Ship</strong>
                    <span className="fulfillmentSelector-description">
                        Enter a delivery address. A sales representative will provide the shipping
                        quote.
                    </span>
                </span>
            </div>
            <div className="fulfillmentSelector-option">
                <input
                    aria-label="Warehouse pickup"
                    checked={isPickup}
                    disabled={isLoading || !location?.pickupMethodId}
                    id="fulfillment-method-pickup"
                    name="fulfillmentMethod"
                    onChange={() => onChange(true)}
                    type="radio"
                />
                <span className="fulfillmentSelector-optionText">
                    <strong>Warehouse pickup</strong>
                    <span className="fulfillmentSelector-description">
                        {location
                            ? `Pickup at ${location.label} Warehouse`
                            : 'Pickup is unavailable for this shopping location.'}
                    </span>
                </span>
            </div>
        </div>
    </fieldset>
);

export default FulfillmentSelector;
