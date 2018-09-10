import section from 'section-tests';
import assert from 'assert';
import ServiceManager from '@infect/rda-service-manager';
import ServiceRegistryClient from '../src/ServiceRegistryClient.mjs';



const host = 'http://l.dns.porn:9000';



section('RDA Service Registry Client', (section) => {
    let sm;

    section.setup(async() => {
        sm = new ServiceManager({
            args: '--dev --log-level=error+ --log-module=*'.split(' '),
        });

        await sm.startServices('rda-service-registry');
    });




    section.test('Register and deregister', async() => {
        section.notice('starting the service');
        const client = new ServiceRegistryClient(host);


        section.notice('registering');
        await client.register({
            serviceName: 'client-test',
            port: 8000,
        });


        assert(client.ttl);


        section.notice('de-registering');
        await client.deregister();
    });




    section.test('Resolve', async() => {
        section.notice('starting the service');
        const client = new ServiceRegistryClient(host);


        section.notice('registering');
        await client.register({
            serviceName: 'client-test',
            port: 8000,
        });


        section.notice('resolving');
        const address = await client.resolve('client-test');
        
        assert(address);


        section.notice('de-registering');
        await client.deregister();
    });




    section.destroy(async() => {
        await sm.stopServices();
    });
});
