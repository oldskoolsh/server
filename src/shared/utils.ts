/*
 * Copyright 2020 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
