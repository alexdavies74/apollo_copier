
describe("AsanaClientRetry", function() {
    describe("#dispatch", function() {
        var sandbox, retryingClient, remainingFailures;

        var client = { dispatcher: { dispatch: function() {
            if (remainingFailures-- > 0) {
                return Promise.reject("some reason");
            } else {
                return Promise.resolve({data:{}});
            }
        }}};

        function dispatchWithFailures(failures) {
            remainingFailures = failures || 0;
            var success;
            aei.Future.withPromise(retryingClient.dispatch({}).then(
                function() { success = true; },
                function() { success = false; }
            )).wait();
            return success;
        }

        beforeEach(function() {
            sandbox = sinon.sandbox.create();

            retryingClient = aei.AsanaClientRetry.clone().setClient(client);

            sandbox.spy(client.dispatcher, "dispatch");
            sandbox.stub(Promise, "delay", function() { return Promise.resolve(); });
        });

        afterEach(function() {
            sandbox.restore();
        });

        it("should only call dispatch once if there are no failures", function() {
            dispatchWithFailures(0).should.equal(true);
            expect(client.dispatcher.dispatch).to.have.callCount(1);
        });

        it("should call dispatch twice if there is one failure", function() {
            dispatchWithFailures(1).should.equal(true);
            expect(client.dispatcher.dispatch).to.have.callCount(2);
            expect(Promise.delay.getCall(0).args[0]).to.equal(500);
        });

        it("should backoff exponentially (default backoff=2 delay=500)", function() {
            dispatchWithFailures(3).should.equal(true);
            expect(client.dispatcher.dispatch).to.have.callCount(4);
            expect(Promise.delay.getCall(0).args[0]).to.equal(500);
            expect(Promise.delay.getCall(1).args[0]).to.equal(1000);
            expect(Promise.delay.getCall(2).args[0]).to.equal(2000);
        });

        it("should respect 'backoff' option", function() {
            retryingClient.setBackoff(1);
            dispatchWithFailures(3).should.equal(true);
            expect(client.dispatcher.dispatch).to.have.callCount(4);
            expect(Promise.delay.getCall(0).args[0]).to.equal(500);
            expect(Promise.delay.getCall(1).args[0]).to.equal(500);
            expect(Promise.delay.getCall(2).args[0]).to.equal(500);
        });

        it("should respect 'delay' option", function() {
            retryingClient.setDelay(100);
            dispatchWithFailures(3).should.equal(true);
            expect(client.dispatcher.dispatch).to.have.callCount(4);
            expect(Promise.delay.getCall(0).args[0]).to.equal(100);
            expect(Promise.delay.getCall(1).args[0]).to.equal(200);
            expect(Promise.delay.getCall(2).args[0]).to.equal(400);
        });

        it("should respect 'retries' option", function() {
            retryingClient.setRetries(10);
            dispatchWithFailures(10).should.equal(true);
        });

        it("should fail after 'retries' retries", function() {
            retryingClient.setRetries(10);
            dispatchWithFailures(11).should.equal(false);
        });
    });
});
