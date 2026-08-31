import { getCustomerMessage, getOrderComment, getShoppingLocation } from './shoppingLocation';

describe('shoppingLocation', () => {
    const message = '[Shopping location: Powell Wyoming (#2)] Call before delivery';

    it('parses the selected location marker', () => {
        expect(getShoppingLocation(message)).toEqual({
            id: 2,
            label: 'Powell Wyoming',
            marker: '[Shopping location: Powell Wyoming (#2)]',
            pickupMethodId: undefined,
        });
    });

    it('parses the pickup method used by the fulfillment selector', () => {
        expect(
            getShoppingLocation(
                '[Shopping location: Powell Wyoming (#2)][Pickup method: #7] Call before delivery',
            ),
        ).toEqual({
            id: 2,
            label: 'Powell Wyoming',
            marker: '[Shopping location: Powell Wyoming (#2)][Pickup method: #7]',
            pickupMethodId: 7,
        });
    });

    it('keeps the internal marker out of the shopper order comment', () => {
        expect(getOrderComment(message)).toBe('Call before delivery');
    });

    it('preserves the marker when the shopper changes their order comment', () => {
        expect(getCustomerMessage(getShoppingLocation(message), 'New comment')).toBe(
            '[Shopping location: Powell Wyoming (#2)] New comment',
        );
    });
});
