import CryptoJS from "crypto-js";

export class RandomUIDUtils {
  private static generateRandomString(characters: string, length: number) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += characters[Math.floor(Math.random() * characters.length)];
    }
    return result;
  }

  static generateRandomUid(prefix: string) {
    const randomString = CryptoJS.lib.WordArray.random(8).toString(
      CryptoJS.enc.Hex,
    );
    return `${prefix}${randomString}`;
  }

  static generateUsername(firstName: string) {
    const randomString = CryptoJS.lib.WordArray.random(2).toString(
      CryptoJS.enc.Hex,
    );
    return `${firstName.toLowerCase()}_${randomString}`;
  }

  static generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static convertToUnderscore(data: string) {
    return data.replace(/ /g, "_");
  }

  static generateNotificationId(prefix: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    return `${prefix}${timestamp}${this.generateRandomString("0123456789abcde", 7)}`;
  }

  static generateRandomCapsId(length = 8) {
    return this.generateRandomString("ABCDEFGHIJKLMNOPQRSTUVWXYZ", length);
  }

  static generateUID(prefix: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    return `${prefix}${timestamp}${this.generateRandomString("0123456789abcde", 7)}`;
  }
}
