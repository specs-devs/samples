// Class representing Supabase project credentials
export class SupabaseProjectCredential {

  constructor(name, id, domain) {
    this._name = name
    this._id = id
    this._domain = domain
    this._anonToken = ''
    this._privateToken = ''
  }
  set name(name) {
    this._name = name
  }
  get name () {
    return this._name
  }

  set id(id) {
    this._id = id
  }
  get id () {
    return this._id
  }

  get url () {
    return `https://${this._id}.${this._domain}`
  }

  set anonToken(anonToken) {
    this._anonToken = anonToken
  }
  get anonToken () {
    return this._anonToken
  }

  set privateToken(privateToken) {
    this._privateToken = privateToken
  }
  get privateToken () {
    return this._privateToken
  }
};
