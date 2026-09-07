import { describe, expect, it } from 'vitest';
import { tagLabel } from './tag-labels';

describe('tagLabel', () => {
  it('översätter de interna nycklarna', () => {
    expect(tagLabel('sap-con')).toBe('sapere eller conoscere');
    expect(tagLabel('fwd')).toBe('engelska → italienska');
    expect(tagLabel('back')).toBe('italienska → svenska');
  });

  it('visar okända taggar som de är, så nya frågor fungerar utan ändring här', () => {
    expect(tagLabel('nagot-nytt')).toBe('nagot-nytt');
  });
});
