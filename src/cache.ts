export class LruCache<T> {
    private values: Map<Number, T> = new Map<number, T>();
    private maxEntries: number = 20;

    public cachedIds(): Number[] {
        return Array.from( this.values.keys() );
    }

    public get(key: number): T|null {
        if ( this.values.has(key) ) {
            let entry = this.values.get(key);
            if ( entry ) {
                this.values.delete(key);
                this.values.set(key, entry);
                return entry;
            } else {
                return null;
            }
        } else {
            return null
        }
    }

    public put(key: number, value: T) {
        this.values.set(key, value);
        setTimeout(() => {
            console.log(`Removing cached show result: ${key}`);
            this.values.delete(key);
        }, 60_000);
    }
}