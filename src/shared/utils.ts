export {} // escape the module context...
declare global {
    interface Array<T> {
        asyncFlatMap<U>(c: (i: T) => Promise<U | Array<U>>): Promise<Array<U>>
    }
}
Array.prototype.asyncFlatMap = async function (c) {
    return (await Promise.all(this.map(i => c(i)))).flatMap(value => value);
}

export class aff {
}
